// Passerelle SMS — envoi des codes OTP (inscription, récupération de code) et
// des invitations par SMS.
//
// - Mode réel : INFOBIP_API_KEY configuré → envoi via l'API Infobip (canal « sms »).
// - Mode dégradé (défaut) : journalisation serveur — le code OTP n'est JAMAIS
//   affiché côté client ni exposé dans les logs de l'application (sujet sécurisé).

import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/csv";

export function isSmsEnabled(): boolean {
  return Boolean(process.env.INFOBIP_API_KEY && process.env.INFOBIP_BASE_URL);
}

const SMS_SENDER = process.env.INFOBIP_SENDER || "SIGMA";

/**
 * Envoie un SMS réel (si configuré) ou journalise (mode dégradé).
 * Ne jette jamais : un échec d'envoi ne doit pas bloquer l'inscription.
 */
export async function sendSms(input: { to: string; text: string; otpCode?: string }): Promise<{ sent: boolean; via: string }> {
  // Normalisation du numéro : retire +229 / 00229 / espaces (réutilise la même
  // règle que les imports CSV et les liens WhatsApp) puis passe au format E.164.
  const digits = normalizePhone(input.to).replace(/\D/g, "");
  const e164 = digits.startsWith("229") ? `+${digits}` : `+229${digits}`;

  if (!isSmsEnabled()) {
    // Mode dégradé : trace SANS exposer le code (l'OTP est masqué).
    const safeText = input.otpCode ? input.text.replace(input.otpCode, "••••••") : input.text;
    console.log(`[sms:degraded] → ${e164}\n  texte : ${safeText}`);
    return { sent: false, via: "degraded" };
  }

  try {
    const baseUrl = process.env.INFOBIP_BASE_URL;
    const apiKey = process.env.INFOBIP_API_KEY;

    const res = await fetch(`https://${baseUrl}/sms/2/text/single`, {
      method: "POST",
      headers: {
        "Authorization": `AppKey ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            from: SMS_SENDER,
            to: e164,
            text: input.text,
          },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[sms] Infobip ${res.status}: ${detail.slice(0, 200)}`);
      return { sent: false, via: "error" };
    }
    console.log(`[sms] ✓ envoyé via Infobip → ${e164}`);
    return { sent: true, via: "infobip" };
  } catch (e) {
    console.error("[sms] erreur Infobip", e);
    return { sent: false, via: "error" };
  }
}

/**
 * Génère et envoie un code OTP à 6 chiffres (10 min de validité) par EMAIL
 * (file d'attente Resend) et/ou SMS (Infobip), puis l'enregistre en base avec
 * son `purpose` : un OTP de retrait ne peut pas valider une inscription et
 * inversement.
 *
 * Canaux selon le purpose :
 *  - inscription : email uniquement
 *  - recuperation : SMS (le téléphone est le seul canal connu)
 *  - retrait (organisateur) : email (si connu) + SMS — sécurisation du retrait
 *    par code de validation (brief sigma-events-commissions-brief-1.md)
 */
export async function issueOtp(input: {
  phone: string;
  email?: string;
  name: string;
  purpose: "inscription" | "recuperation" | "retrait";
}): Promise<void> {
  // Purge les OTP expirés de ce numéro, puis génère le nouveau code.
  await prisma.otpCode.deleteMany({ where: { phone: input.phone, expiresAt: { lt: new Date() } } });
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.$transaction([
    prisma.otpCode.updateMany({ where: { phone: input.phone, consumed: false }, data: { consumed: true } }),
    prisma.otpCode.create({
      data: { phone: input.phone, code, expiresAt: new Date(Date.now() + 10 * 60_000), purpose: input.purpose },
    }),
  ]);

  // Le SMS est TOUJOURS envoyé : le numéro de téléphone est le canal fiable de
  // vérification (inscription, récupération, retrait). L'email part en plus quand
  // il est connu. C'est la correction du flux « je ne reçois jamais le code » :
  // seul le retrait envoyait un SMS, l'inscription et la récupération n'envoyaient
  // qu'un email (ou rien si pas d'email connu).
  const purposeLabel: Record<string, string> = {
    inscription: "de vérification",
    recuperation: "de récupération",
    retrait: "de retrait",
  };
  const message = `SIGMA Events — votre code ${purposeLabel[input.purpose] ?? "de vérification"} : ${code}. Valable 10 minutes. Ne le partagez avec personne.`;
  await sendSms({ to: input.phone, text: message, otpCode: code });

  if (input.email) {
    const { enqueueEmail } = await import("./queue");
    await enqueueEmail({
      type: "otp",
      to: input.email,
      name: input.name,
      code,
    });
  }
}
