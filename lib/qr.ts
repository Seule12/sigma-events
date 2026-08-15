import QRCode from "qrcode";
import { encryptTicketQr, hasTicketCryptoSecret } from "@/lib/ticket-crypto";

const APP_URL = process.env.APP_URL || "http://localhost:3000";

export function ticketUrl(code: string) {
  return `${APP_URL}/t/${code}`;
}

// Extrait le code d'un scan : le QR du billet encode l'URL /t/{code} (ou /i/{code}),
// mais on accepte aussi le code nu saisi manuellement (ex : VIP-4F2A9C).
// Retourne le code brut (non normalisé) — l'appelant applique sa propre casse.
export function extractTicketCode(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length >= 2 && (segments[0] === "t" || segments[0] === "i")) {
      return decodeURIComponent(segments[segments.length - 1]);
    }
  } catch {
    // Pas une URL → code nu, on le retourne tel quel.
  }
  return trimmed;
}

// Lien public de l'invitation : l'invité l'ouvre pour voir son invitation nominative + QR.
export function invitationUrl(code: string) {
  return `${APP_URL}/i/${code}`;
}

// Génère l'image QR d'un billet. Le QR encode un blob CHIFFRÉ (AES-256-GCM,
// clé de session dérivée de l'événement) — jamais le code en clair : le
// scanner le déchiffre côté serveur (/api/tickets/verify) ou localement avec
// sa clé de session. Sans TICKET_QR_SECRET (mode dégradé), repli sur l'URL
// /t/{code} historique.
// Contenu à encoder dans un QR généré côté client (<LazyQr />) : blob chiffré
// du billet (ou URL /t/{code} en repli dégradé sans TICKET_QR_SECRET).
export function ticketQrContent(
  ticket: { id: string; eventId: string; code: string; guestCount?: number | null }
): string {
  return hasTicketCryptoSecret()
    ? encryptTicketQr({
        eventId: ticket.eventId,
        ticketId: ticket.id,
        plusOne: Math.max(0, (ticket.guestCount ?? 1) - 1),
        expiresAt: null,
      })
    : ticketUrl(ticket.code);
}

export async function ticketQrDataUrl(
  ticket: { id: string; eventId: string; code: string; guestCount?: number | null },
  size = 220
) {
  try {
    const content = hasTicketCryptoSecret()
      ? encryptTicketQr({
          eventId: ticket.eventId,
          ticketId: ticket.id,
          plusOne: Math.max(0, (ticket.guestCount ?? 1) - 1),
          expiresAt: null,
        })
      : ticketUrl(ticket.code);
    return await QRCode.toDataURL(content, {
      width: size,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
  } catch {
    return null;
  }
}

export function whatsappTicketLink(phone: string | null, eventName: string, guestName: string, code: string) {
  if (!phone) return null;
  // Garde-fou : ne jamais doubler le préfixe +229 (même si le numéro est déjà préfixé).
  const digits = phone.replace(/\D/g, "");
  const clean = digits.startsWith("00229") ? digits.slice(5) : digits.startsWith("229") ? digits.slice(3) : digits;
  return `https://wa.me/229${clean}?text=${encodeURIComponent(
    `SIGMA — ${eventName}\n\nBonjour ${guestName},\nVoici votre billet d'entrée :\n${ticketUrl(code)}`
  )}`;
}

// Lien de partage WhatsApp d'une invitation nominative (avec le +1 si invité).
export function whatsappInviteLink(
  phone: string | null,
  eventName: string,
  guestName: string,
  code: string,
  guestCount = 1
) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const clean = digits.startsWith("00229") ? digits.slice(5) : digits.startsWith("229") ? digits.slice(3) : digits;
  const people =
    guestCount > 1
      ? `\n👥 ${guestCount} personnes autorisées`
      : "";
  return `https://wa.me/229${clean}?text=${encodeURIComponent(
    `SIGMA — ${eventName}\n\nBonjour ${guestName},${people}\nVoici votre invitation :\n${invitationUrl(code)}`
  )}`;
}

// Lien sms d'envoi de l'invitation (pré-rempli) : ouvre l'application SMS natif
// du téléphone avec le message prêt à envoyer (canal SMS, concept §2.3).
export function smsInviteLink(
  phone: string | null,
  eventName: string,
  guestName: string,
  code: string,
  guestCount = 1
) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  const clean = digits.startsWith("00229") ? digits.slice(5) : digits.startsWith("229") ? digits.slice(3) : digits;
  const people = guestCount > 1 ? `\n${guestCount} personnes autorisées` : "";
  return `sms:+229${clean}?body=${encodeURIComponent(
    `${eventName}\n\nBonjour ${guestName},${people}\nVoici votre invitation :\n${invitationUrl(code)}`
  )}`;
}

// Lien mailto d'envoi de l'invitation par email (pré-rempli).
export function emailInviteLink(
  email: string | null,
  eventName: string,
  guestName: string,
  code: string,
  guestCount = 1
) {
  if (!email) return null;
  const people = guestCount > 1 ? `${guestCount} personnes autorisées — ` : "";
  return `mailto:${email}?subject=${encodeURIComponent(
    `🎟️ Votre invitation — ${eventName}`
  )}&body=${encodeURIComponent(
    `Bonjour ${guestName},\n\nVous êtes invité(e) à ${eventName}.${people}\n\n👉 Ouvrez votre invitation :\n${invitationUrl(code)}\n\n— ${eventName}`
  )}`;
}
