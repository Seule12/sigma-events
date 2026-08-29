// WhatsApp Business API — SIGMA Events
//
// Flow billet :
//   1. Après paiement → le client clique « Écrire sur WhatsApp »
//   2. Le client envoie un message contenant sa référence de transaction
//   3. Le webhook détecte la référence → trouve le billet → génère le PNG → l'envoie
//   4. Si pas de message après 5 min → envoi automatique du billet
//
// Cela évite de payer les frais Meta pour chaque envoi : le client paie la
// première interaction, et l'envoi gratuit ne coûte que si le client ne réagit pas.

import { prisma } from "@/lib/prisma";
import { ticketRef } from "@/lib/ticket-ref";
import { OrderStatus } from "@/app/generated/prisma/enums";

const GRAPH_VERSION = "v21.0";
const APP_URL = process.env.APP_URL || "http://localhost:3000";

// ── Clés de session stockées en mémoire pour le suivi des envois en attente ──
// Mappe : clé = `${orderId}:${phone}` → timestamp de la demande
const pendingTicketRequests = new Map<string, number>();

export function isWhatsAppEnabled(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Normalise un numéro vers le format international (WhatsApp exige E.164, sans +). */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("229")) return digits;
  if (digits.startsWith("01")) return `229${digits}`;
  return `229${digits}`;
}

// ══════════════════════════════════════════════════════════════
//  ENVOI TEXTE
// ══════════════════════════════════════════════════════════════

/**
 * Envoie un message WhatsApp texte.
 * Ne jette jamais — un échec ne bloque pas le flux client.
 */
export async function sendWhatsApp(input: { to: string; text: string }): Promise<{ sent: boolean; via: string }> {
  if (!isWhatsAppEnabled()) {
    console.log(`[whatsapp:degraded] → ${toE164(input.to)}\n  texte : ${input.text.slice(0, 160)}`);
    return { sent: false, via: "degraded" };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toE164(input.to),
          type: "text",
          text: { body: input.text },
        }),
      }
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[whatsapp] Meta ${res.status}: ${detail.slice(0, 200)}`);
      return { sent: false, via: "error" };
    }
    console.log(`[whatsapp] ✓ envoyé via Meta → ${toE164(input.to)}`);
    return { sent: true, via: "meta" };
  } catch (e) {
    console.error("[whatsapp] erreur Meta", e);
    return { sent: false, via: "error" };
  }
}

// ══════════════════════════════════════════════════════════════
//  ENVOI IMAGE (billet PNG)
// ══════════════════════════════════════════════════════════════

/**
 * Upload une image (Buffer) sur le serveur Meta et retourne l'ID media.
 */
async function uploadMedia(imageBuffer: Buffer): Promise<string | null> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !token) return null;

  try {
    const formData = new FormData();
    formData.append("messaging_product", "whatsapp");
    formData.append("file", new Blob([new Uint8Array(imageBuffer)], { type: "image/png" }), "billet.png");
    formData.append("type", "image/png");

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      }
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[whatsapp:media] Upload échoué ${res.status}: ${detail.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    return data.id ?? null;
  } catch (e) {
    console.error("[whatsapp:media] Erreur upload", e);
    return null;
  }
}

/**
 * Envoie une image WhatsApp (billet PNG) avec un message texte.
 */
export async function sendWhatsAppImage(
  to: string,
  imageBuffer: Buffer,
  caption: string
): Promise<{ sent: boolean; via: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId || !token) {
    console.log(`[whatsapp:image:degraded] → ${toE164(to)} (pas de clé API)`);
    return { sent: false, via: "degraded" };
  }

  // Étape 1 : upload l'image
  const mediaId = await uploadMedia(imageBuffer);
  if (!mediaId) return { sent: false, via: "media-error" };

  // Étape 2 : envoie le message image
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: toE164(to),
          type: "image",
          image: { id: mediaId, caption },
        }),
      }
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[whatsapp:image] Meta ${res.status}: ${detail.slice(0, 200)}`);
      return { sent: false, via: "error" };
    }

    console.log(`[whatsapp:image] ✓ Image envoyée à ${toE164(to)}`);
    return { sent: true, via: "meta-image" };
  } catch (e) {
    console.error("[whatsapp:image] Erreur envoi", e);
    return { sent: false, via: "error" };
  }
}

// ══════════════════════════════════════════════════════════════
//  TEMPLATE MESSAGE BILLET (selon le modèle fourni)
// ══════════════════════════════════════════════════════════════

/**
 * Génère le message de livraison du billet selon le template fourni.
 * {{acheteur}}, {{evenement}}, {{ref}} sont remplacés.
 */
export function ticketMessage(eventName: string, guestName: string, reference: string): string {
  return `Bonjour, 👋 *${guestName}*

Merci pour votre achat pour *${eventName}* 🔖

Ci-joint votre billet :
Référence : *${reference}*

A bientôt

*Sigma Events*`;
}

/** Message de livraison d'une invitation nominative. */
export function inviteMessage(eventName: string, guestName: string, inviteUrl: string, guestCount = 1): string {
  const people = guestCount > 1 ? `\n${guestCount} personnes autorisées` : "";
  return `SIGMA — ${eventName}\n\nBonjour ${guestName},${people}\nVoici votre invitation :\n${inviteUrl}\n— Sigma Events`;
}

// ══════════════════════════════════════════════════════════════
//  FLOW BILLET : attente message → extraction ref → envoi PNG
// ══════════════════════════════════════════════════════════════

/**
 * Enregistre une commande comme "en attente de message WhatsApp".
 * Le client doit écrire en premier (pour éviter les frais Meta).
 * Si pas de message après 5 min → envoi automatique.
 */
export function trackPendingTicketRequest(orderId: string, phone: string): void {
  const key = `${orderId}:${toE164(phone)}`;
  pendingTicketRequests.set(key, Date.now());
  console.log(`[whatsapp:pending] Track ${key}`);

  // Planifier l'envoi automatique après 5 minutes
  setTimeout(async () => {
    if (pendingTicketRequests.has(key)) {
      pendingTicketRequests.delete(key);
      console.log(`[whatsapp:auto] Pas de message après 5 min → envoi auto pour ${key}`);
      await autoSendTicket(orderId, phone);
    }
  }, 5 * 60 * 1000); // 5 minutes
}

/**
 * Vérifie si une commande est en attente de message WhatsApp.
 */
export function isPendingTicketRequest(orderId: string, phone: string): boolean {
  const key = `${orderId}:${toE164(phone)}`;
  return pendingTicketRequests.has(key);
}

/**
 * Marque une commande comme "message reçu" (annule l'envoi auto).
 */
export function consumePendingTicketRequest(orderId: string, phone: string): boolean {
  const key = `${orderId}:${toE164(phone)}`;
  const existed = pendingTicketRequests.has(key);
  pendingTicketRequests.delete(key);
  return existed;
}

/**
 * Envoi automatique du billet (fallback si pas de message après 5 min).
 * Génère le PNG côté serveur et l'envoie via WhatsApp.
 */
async function autoSendTicket(orderId: string, phone: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { event: true, category: true, tickets: true },
    });
    if (!order || order.status !== OrderStatus.PAID || order.tickets.length === 0) {
      console.log(`[whatsapp:auto] Commande ${orderId} non éligible (status: ${order?.status})`);
      return;
    }

    const ticket = order.tickets[0];

    // Générer le PNG du billet côté serveur
    const imageBuffer = await generateTicketPng(ticket.code);
    if (!imageBuffer) {
      console.log(`[whatsapp:auto] Impossible de générer le PNG pour ${ticket.code}`);
      // Fallback : envoyer un lien texte
      const textMsg = ticketMessage(order.event.name, order.customerName, ticketRef(order.reference));
      await sendWhatsApp({ to: phone, text: textMsg });
      return;
    }

    const caption = ticketMessage(order.event.name, order.customerName, ticketRef(order.reference));
    const result = await sendWhatsAppImage(phone, imageBuffer, caption);
    console.log(`[whatsapp:auto] Résultat envoi auto billet ${ticket.code}:`, result);

    // Mettre à jour le statut de livraison
    if (result.sent) {
      await prisma.ticket.updateMany({
        where: { id: { in: order.tickets.map((t) => t.id) } },
        data: { inviteStatus: "SENT" },
      });
    }
  } catch (e) {
    console.error(`[whatsapp:auto] Erreur envoi auto orderId=${orderId}`, e);
  }
}

/**
 * Génère un PNG du billet côté serveur.
 * Utilise une URL interne Next.js pour rendre le composant ticket en HTML,
 * puis le convertit via l'API /api/tickets/[code]/image.
 */
async function generateTicketPng(code: string): Promise<Buffer | null> {
  try {
    const imageUrl = `${APP_URL}/api/tickets/${encodeURIComponent(code)}/image`;
    const res = await fetch(imageUrl);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    console.error(`[whatsapp:png] Erreur génération PNG pour ${code}`, e);
    return null;
  }
}

/**
 * Parse un message WhatsApp pour en extraire une référence de commande.
 * Accepte les formats : "REF-XXXXXX", "référence: XXXXXX", "ref XXXXXX",
 * ou simplement un code alphanumérique de 6+ caractères.
 */
export function extractReferenceFromMessage(text: string): string | null {
  const cleaned = text.trim();

  // Format : REF-XXXXXX ou ref: XXXXXX
  const explicitMatch = cleaned.match(/(?:ref(?:érence)?|réf|réf[ée]rence)[\s:]*([A-Z0-9-]{6,})/i);
  if (explicitMatch) return explicitMatch[1].trim();

  // Format : code alphanumérique seul (6+ caractères, avec tirets optionnels)
  const codeMatch = cleaned.match(/^([A-Z0-9](?:[A-Z0-9-]{5,}))$/i);
  if (codeMatch) return codeMatch[1].trim();

  return null;
}

/**
 * Traite un message WhatsApp entrant contenant une référence de commande.
 * Trouve le billet correspondant et l'envoie en PNG.
 */
export async function handleTicketRequestByReference(
  from: string,
  reference: string
): Promise<{ found: boolean; sent: boolean }> {
  const phone = from.replace(/\D/g, "");

  // Chercher la commande par référence (d'abord par le code du billet, puis par ref commande)
  let order = await prisma.order.findFirst({
    where: {
      tickets: { some: { code: { contains: reference } } },
      status: OrderStatus.PAID,
    },
    include: { event: true, category: true, tickets: true },
  });

  // Fallback : chercher par référence de commande ou par ID
  if (!order) {
    order = await prisma.order.findFirst({
      where: {
        OR: [
          { reference: { contains: reference } },
          { id: reference },
        ],
        status: OrderStatus.PAID,
      },
      include: { event: true, category: true, tickets: true },
    });
  }

  if (!order) {
    console.log(`[whatsapp:tickets] Aucune commande trouvée pour ref=${reference}`);
    await sendWhatsApp({
      to: from,
      text: `Aucun billet trouvé pour la référence *${reference}*.

Vérifiez la référence sur votre reçu de paiement.

Besoin d'aide ? Contactez-nous : ${APP_URL}/support`,
    });
    return { found: false, sent: false };
  }

  console.log(`[whatsapp:tickets] Commande trouvée : ${order.id} (${order.tickets.length} billet(s))`);

  // Annuler l'envoi auto si en attente
  consumePendingTicketRequest(order.id, phone);

  // Envoyer chaque billet en PNG
  for (const ticket of order.tickets) {
    const imageBuffer = await generateTicketPng(ticket.code);
    const caption = ticketMessage(order.event.name, order.customerName, ticketRef(order.reference));

    if (imageBuffer) {
      const result = await sendWhatsAppImage(from, imageBuffer, caption);
      console.log(`[whatsapp:tickets] Billet ${ticket.code} envoyé:`, result);

      if (result.sent) {
        await prisma.ticket.update({
          where: { id: ticket.id },
          data: { inviteStatus: "SENT" },
        });
      }
    } else {
      // Fallback texte
      await sendWhatsApp({
        to: from,
        text: caption + `\n\nVoir le billet : ${APP_URL}/t/${ticket.code}`,
      });
    }
  }

  return { found: true, sent: true };
}

// ══════════════════════════════════════════════════════════════
//  LIEN DE PARTAGE (wa.me — pour le bouton "Écrire sur WhatsApp")
// ══════════════════════════════════════════════════════════════

/**
 * Génère le lien wa.me pour que le client écrive avec sa référence.
 * Le message pré-rempli contient la référence de la commande.
 */
export function whatsappWriteFirstLink(phone: string, reference: string): string {
  const digits = toE164(phone);
  const message = `Bonjour, je souhaite recevoir mon billet.\nMa référence : ${reference}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
