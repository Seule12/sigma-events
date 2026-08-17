// WhatsApp automatisé — envoi du billet / de l'invitation via l'API WhatsApp
// Business Cloud (Meta Graph API). Complète les liens wa.me (partage manuel).
//
// - Mode réel : WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID configurés → envoi via
//   `POST /<version>/<phone_number_id>/messages` (message texte avec lien).
// - Mode dégradé (défaut) : journalisation — le flux wa.me existant reste utilisé
//   côté client (la confirmation affiche déjà le bouton de partage).
//
// ⚠️ L'API Business exige un numéro de téléphone de type « business » (Business
//   Portfolio) et des templates approuvés pour les messages hors session (24 h).

const GRAPH_VERSION = "v21.0";

export function isWhatsAppEnabled(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** Normalise un numéro vers le format international (WhatsApp exige E.164, sans +). */
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("229") ? digits : `229${digits}`;
}

/**
 * Envoie un message WhatsApp (texte + lien) ou journalise (mode dégradé).
 * Ne jette jamais : un échec d'envoi ne bloque pas le flux client.
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

/** Message de livraison du billet (template texte — à migrer vers un template approuvé). */
export function ticketMessage(eventName: string, guestName: string, ticketUrl: string): string {
  return `SIGMA — ${eventName}\n\nBonjour ${guestName},\nVoici votre billet d'entrée :\n${ticketUrl}\n\nPrésentez le QR code à l'entrée. Un seul scan autorisé.\n— Sigma Events`;
}

/** Message de livraison d'une invitation nominative. */
export function inviteMessage(eventName: string, guestName: string, inviteUrl: string, guestCount = 1): string {
  const people = guestCount > 1 ? `\n${guestCount} personnes autorisées` : "";
  return `SIGMA — ${eventName}\n\nBonjour ${guestName},${people}\nVoici votre invitation :\n${inviteUrl}\n— Sigma Events`;
}
