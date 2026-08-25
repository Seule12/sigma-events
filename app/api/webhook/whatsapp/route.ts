// Webhook WhatsApp Business API — SIGMA Events
// Route : /api/webhook/whatsapp
//
// Flux :
//   1. Meta appelle GET pour vérifier l'endpoint (hub.mode=subscribe)
//   2. Meta envoie les statuts de livraison et messages entrants via POST
//   3. On met à jour le statut de livraison des billets en base (inviteStatus)
//
// Variables d'env requises :
//   WHATSAPP_VERIFY_TOKEN — token de vérification du webhook (défini dans Meta Dashboard)
//   WHATSAPP_TOKEN        — token d'accès à l'API (pour les réponses automatiques)

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ──────────────────────────────────────────────────────────────
// GET — Vérification du webhook par Meta
// ──────────────────────────────────────────────────────────────
export function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (!verifyToken) {
    console.error("[whatsapp:webhook] WHATSAPP_VERIFY_TOKEN non configuré");
    return NextResponse.json({ error: "VERIFY_TOKEN_NOT_CONFIGURED" }, { status: 503 });
  }

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[whatsapp:webhook] ✓ Vérification réussie");
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  console.warn("[whatsapp:webhook] ✗ Vérification échouée", { mode, token });
  return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
}

// ──────────────────────────────────────────────────────────────
// POST — Réception des événements (statuts + messages)
// ──────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  // Toujours répondre 200 rapidement pour éviter les rejeux Meta
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  // Vérification que c'est bien un événement WhatsApp Business
  if (body.object !== "whatsapp_business_account") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const entries = Array.isArray(body.entry) ? body.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change.value as Record<string, unknown> | undefined;
      if (!value) continue;

      // ── Statuts de livraison des billets ──
      if (Array.isArray(value.statuses)) {
        await handleStatuses(value.statuses);
      }

      // ── Messages entrants (réponses client) ──
      if (Array.isArray(value.messages)) {
        await handleIncomingMessages(value.messages);
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// ──────────────────────────────────────────────────────────────
// Statuts de livraison : sent → delivered → read / failed
// ──────────────────────────────────────────────────────────────
async function handleStatuses(statuses: Record<string, unknown>[]) {
  // Mappe les statuts Meta vers les InvitationStatus de Prisma
  const STATUS_MAP: Record<string, string> = {
    sent: "SENT",
    delivered: "SENT",     // delivered = confirmé envoyé
    read: "OPENED",        // lu = le client a ouvert le message
    failed: "CANCELLED",   // échec = on标记 comme annulé
  };

  for (const status of statuses) {
    const recipientId = String(status.recipient_id ?? "");
    const msgStatus = String(status.status ?? "").toLowerCase();
    const messageId = String(status.id ?? "");
    const errors = status.errors as Array<{ code: number; title: string; message: string; error_data?: { details: string } }> | undefined;

    if (!recipientId || !msgStatus) continue;

    const mappedStatus = STATUS_MAP[msgStatus];
    if (!mappedStatus) continue;

    console.log(`[whatsapp:webhook] Statut billet → ${recipientId} : ${msgStatus} (message: ${messageId})`);

    // Met à jour les billets envoyés à ce numéro de téléphone
    // Le recipient_id est le numéro sans le "+"
    const normalizedPhone = normalizePhoneForMatch(recipientId);

    try {
      const result = await prisma.ticket.updateMany({
        where: {
          guestPhone: { contains: normalizedPhone },
          inviteStatus: {
            notIn: ["ENTERED", "CANCELLED"],
            // Ne pas rétrograder : on met à jour seulement si le statut actuel
            // est inférieur ou égal au nouveau statut
            in: getStatusesUpTo(mappedStatus),
          },
        },
        data: {
          inviteStatus: mappedStatus as "SENT" | "OPENED" | "CANCELLED",
        },
      });

      if (result.count > 0) {
        console.log(`[whatsapp:webhook] ✓ ${result.count} billet(s) mis à jour : ${mappedStatus}`);
      }

      // Si échec, tracer les détails
      if (msgStatus === "failed" && errors?.length) {
        const err = errors[0];
        console.error(`[whatsapp:webhook] ✗ Échec envoi → ${recipientId}`, {
          code: err.code,
          title: err.title,
          message: err.message,
          details: err.error_data?.details,
        });
      }
    } catch (e) {
      console.error("[whatsapp:webhook] Erreur mise à jour statut", e);
    }
  }
}

/**
 * Retourne la liste des statuts éligibles pour une mise à jour vers targetStatus.
 * Empêche de rétrograder (ex: un billet déjà "OPENED" ne revient pas à "SENT").
 */
function getStatusesUpTo(targetStatus: string): ("CREATED" | "GENERATED" | "SENT" | "OPENED" | "CONFIRMED" | "ENTERED" | "CANCELLED")[] {
  const progression = ["CREATED", "GENERATED", "SENT", "OPENED", "CONFIRMED", "ENTERED"] as const;
  const idx = progression.indexOf(targetStatus as (typeof progression)[number]);
  if (idx < 0) return ["CREATED", "GENERATED"];
  // Tous les statuts avant (ou égal) le target sont éligibles
  return [...progression.slice(0, idx + 1)];
}

// ──────────────────────────────────────────────────────────────
// Messages entrants : réponses client (support basique)
// ──────────────────────────────────────────────────────────────
async function handleIncomingMessages(messages: Record<string, unknown>[]) {
  for (const msg of messages) {
    const from = String(msg.from ?? "");
    const type = String(msg.type ?? "");
    const textBody = type === "text" ? String((msg.text as Record<string, unknown>)?.body ?? "") : "";

    console.log(`[whatsapp:webhook] Message reçu de ${from} : ${textBody.slice(0, 100)}`);

    // Réponse automatique basique : si le client envoie "billet" ou "ticket"
    if (textBody && isTicketRequest(textBody)) {
      const phone = normalizePhoneForMatch(from);

      // Chercher les billets actifs de ce client
      const tickets = await prisma.ticket.findMany({
        where: {
          guestPhone: { contains: phone },
          inviteStatus: { notIn: ["CANCELLED"] },
        },
        include: { event: { select: { name: true, date: true, location: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      });

      if (tickets.length === 0) {
        await sendAutoReply(from, "Aucun billet trouvé pour ce numéro. Si vous avez acheté avec un autre numéro, contactez-nous.");
        continue;
      }

      const lines = tickets.map((t) => {
        const eventDate = t.event.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
        const ticketUrl = `${process.env.APP_URL || "http://localhost:3000"}/t/${t.code}`;
        return `🎟 ${t.event.name}\n📅 ${eventDate} — ${t.event.location}\n🔗 ${ticketUrl}\nStatut : ${t.inviteStatus}`;
      });

      const reply = `Bonjour ! Voici vos billets :\n\n${lines.join("\n\n")}\n\nPrésentez le QR code à l'entrée.`;
      await sendAutoReply(from, reply);
    }
  }
}

// ──────────────────────────────────────────────────────────────
// Utilitaires
// ──────────────────────────────────────────────────────────────

/** Normalise un numéro pour la recherche en base (retire le + et le 229 préfixe) */
function normalizePhoneForMatch(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Retire le 229 préfixe pour la recherche flexible
  if (digits.startsWith("229")) return digits.slice(3);
  return digits;
}

/** Détermine si le message est une demande de billet */
function isTicketRequest(text: string): boolean {
  const keywords = ["billet", "ticket", "mon billet", "mes billets", "qr", "code", "entrée"];
  const lower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return keywords.some((k) => lower.includes(k));
}

/** Envoie une réponse automatique via l'API WhatsApp Business */
async function sendAutoReply(to: string, text: string): Promise<void> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.log(`[whatsapp:auto-reply] Mode dégradé → ${to}\n  ${text.slice(0, 160)}...`);
    return;
  }

  try {
    const digits = to.replace(/\D/g, "");
    const e164 = digits.startsWith("229") ? digits : `229${digits}`;

    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: e164,
          type: "text",
          text: { body: text },
        }),
      }
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[whatsapp:auto-reply] Meta ${res.status}: ${detail.slice(0, 200)}`);
    } else {
      console.log(`[whatsapp:auto-reply] ✓ Envoyé à ${e164}`);
    }
  } catch (e) {
    console.error("[whatsapp:auto-reply] Erreur", e);
  }
}
