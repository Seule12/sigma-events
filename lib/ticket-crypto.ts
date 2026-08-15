// Sécurité des QR de billets — port TypeScript de `ticketCrypto.js` (projet de
// référence sigma-scanner-project-1). AES-256-GCM authentifié.
//
// PRINCIPE :
//  - Le QR n'encode JAMAIS le code du billet en clair : il encode un blob
//    chiffré (préfixe `S1{eventId}:` + IV + authTag + ciphertext en Base64URL).
//  - La clé maîtresse `TICKET_QR_SECRET` (64 hex / 32 octets) ne quitte JAMAIS
//    le serveur. La clé de chiffrement d'un événement est DÉRIVÉE par HMAC :
//    key(eventId) = HMAC-SHA256(TICKET_QR_SECRET, "sigma:event:" + eventId).
//    → clé unique par événement, stable dans le temps (les QR restent
//      déchiffrables pendant toute la vie des billets), et révocable en
//      changeant TICKET_QR_SECRET.
//  - L'app scanner reçoit la clé de session (dérivée) uniquement pour son
//    événement : elle peut déchiffrer hors-ligne, jamais la clé maîtresse.
//  - AES-GCM est AUTHENTIFIÉ : 1 bit modifié → déchiffrement refusé.

import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
// Préfixe version 1 + eventId en clair (permet de dériver la bonne clé avant
// déchiffrement — l'eventId n'est pas sensible, il est déjà dans les URLs
// publiques /events/[id] et /acheter/[slug]).
const QR_PREFIX = "S1";

export class TicketVerificationError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "TicketVerificationError";
    this.code = code; // QR_MALFORMED | QR_INVALID_OR_TAMPERED | QR_EXPIRED
  }
}

export function hasTicketCryptoSecret(): boolean {
  return Boolean(process.env.TICKET_QR_SECRET);
}

/** Charge et valide TICKET_QR_SECRET (64 caractères hex = 32 octets). */
function loadMasterKey(): Buffer {
  const hex = process.env.TICKET_QR_SECRET;
  if (!hex) {
    throw new Error("TICKET_QR_SECRET manquant — générez-le : node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"");
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("TICKET_QR_SECRET doit faire 32 octets (64 caractères hex).");
  }
  return key;
}

/**
 * Clé de session d'un événement : dérivée de la clé maîtresse par HMAC-SHA256.
 *  - unique par événement (une clé volée ne sert que pour CET événement) ;
 *  - stable (les QR émis restent déchiffrables) ;
 *  - jamais transmise en clair autrement que via /api/events/:id/session-key
 *    à un agent authentifié de l'événement.
 */
export function deriveEventSessionKey(eventId: string): Buffer {
  return createHmac("sha256", loadMasterKey()).update(`sigma:event:${eventId}`).digest();
}

function toBase64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str: string): Buffer {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLength), "base64");
}

export type TicketQrPayload = {
  eventId: string;
  ticketId: string;
  plusOne: number; // 0 = simple, 1 = invitation +1 (reste informatif, l'état réel est en base)
  expiresAt: number | null; // timestamp Unix (secondes), null = aucune expiration encodée
};

/**
 * Chiffre le payload d'un billet et retourne la chaîne compacte à encoder
 * dans le QR : `S1{eventId}:{base64url(IV + authTag + ciphertext)}`.
 */
export function encryptTicketQr(payload: TicketQrPayload): string {
  const key = deriveEventSessionKey(payload.eventId);
  const iv = randomBytes(IV_LENGTH);
  const data = JSON.stringify({
    tid: payload.ticketId,
    eid: payload.eventId,
    p1: payload.plusOne ?? 0,
    exp: payload.expiresAt ?? null,
    // Nonce aléatoire : deux billets identiques ne produisent jamais le même
    // blob (évite l'analyse de motifs QR).
    n: randomBytes(4).toString("hex"),
  });
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(data, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${QR_PREFIX}${payload.eventId}:${toBase64Url(Buffer.concat([iv, authTag, encrypted]))}`;
}

/**
 * Déchiffre et vérifie l'intégrité d'un QR scanné. Lève TicketVerificationError
 * si le blob a été modifié, expiré, ou chiffré avec une autre clé.
 */
export function decryptTicketQr(qrContent: string): TicketQrPayload {
  const raw = qrContent.trim();
  // Préfixe `S1{eventId}:` — l'eventId en clair permet de dériver la bonne clé.
  if (!raw.startsWith(QR_PREFIX)) {
    throw new TicketVerificationError("QR_MALFORMED", "Format de QR inconnu.");
  }
  const sep = raw.indexOf(":", QR_PREFIX.length);
  if (sep === -1) {
    throw new TicketVerificationError("QR_MALFORMED", "Blob chiffré incomplet.");
  }
  const eventId = raw.slice(QR_PREFIX.length, sep);
  if (!eventId) {
    throw new TicketVerificationError("QR_MALFORMED", "Événement manquant dans le QR.");
  }
  const key = deriveEventSessionKey(eventId);

  let combined: Buffer;
  try {
    combined = fromBase64Url(raw.slice(sep + 1));
  } catch {
    throw new TicketVerificationError("QR_MALFORMED", "Contenu du QR illisible.");
  }
  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new TicketVerificationError("QR_MALFORMED", "Blob chiffré incomplet.");
  }

  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  let decrypted: Buffer;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);
    decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    // Mauvaise clé, blob modifié ou QR forgé — réponse volontairement sobre.
    throw new TicketVerificationError("QR_INVALID_OR_TAMPERED", "Le billet ne peut pas être authentifié.");
  }

  let parsed: { tid?: string; eid?: string; p1?: number; exp?: number | null };
  try {
    parsed = JSON.parse(decrypted.toString("utf8"));
  } catch {
    throw new TicketVerificationError("QR_MALFORMED", "Contenu déchiffré invalide.");
  }
  if (!parsed.tid || !parsed.eid || parsed.eid !== eventId) {
    throw new TicketVerificationError("QR_INVALID_OR_TAMPERED", "Payload invalide.");
  }
  if (parsed.exp && Math.floor(Date.now() / 1000) > parsed.exp) {
    throw new TicketVerificationError("QR_EXPIRED", "Ce billet a expiré.");
  }

  return {
    eventId: parsed.eid,
    ticketId: parsed.tid,
    plusOne: parsed.p1 ?? 0,
    expiresAt: parsed.exp ?? null,
  };
}

/** Vrai si l'entrée scannée est un QR chiffré (plutôt qu'un code saisi à la main). */
export function isEncryptedTicketQr(input: string): boolean {
  return input.trim().startsWith(QR_PREFIX);
}
