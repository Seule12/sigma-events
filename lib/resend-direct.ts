// Envoi direct d'emails via Resend — utilisé pour les OTP qui doivent partir
// immédiatement sans passer par la queue CloudAMQP.
//
// Réservé aux emails transactionnels critiques (OTP, vérification) qui ne
// peuvent pas attendre le worker. Les autres emails (billet, facture) passent
// toujours par la queue pour ne pas ralentir le flow utilisateur.

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || "Sigma Events <onboarding@resend.dev>";

export function isResendEnabled(): boolean {
  return Boolean(RESEND_API_KEY);
}

/**
 * Envoie un email OTP directement via Resend (sans queue).
 * Retourne { sent: boolean } — un échec ne bloque jamais le flow.
 */
export async function sendOtpEmail(input: {
  to: string;
  name: string;
  code: string;
  purpose: "inscription" | "recuperation" | "retrait";
}): Promise<{ sent: boolean; via: string }> {
  if (!isResendEnabled()) {
    console.log(`[resend:degraded] OTP ${input.purpose} → ${input.to} (code masqué)`);
    return { sent: false, via: "degraded" };
  }

  const purposeLabel: Record<string, string> = {
    inscription: "vérification de votre numéro",
    recuperation: "récupération de votre code personnel",
    retrait: "validation de votre retrait",
  };

  const subject = `SIGMA Events — Code de ${purposeLabel[input.purpose]}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="font-size: 24px; font-weight: 800; color: #0f172a; margin: 0;">SIGMA Events</h1>
      </div>
      <p style="font-size: 16px; color: #334155; margin: 0 0 16px;">
        Bonjour <strong>${input.name}</strong>,
      </p>
      <p style="font-size: 15px; color: #475569; margin: 0 0 24px;">
        Voici votre code de ${purposeLabel[input.purpose]} :
      </p>
      <div style="text-align: center; margin: 24px 0;">
        <span style="display: inline-block; font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #0f172a; background: #f1f5f9; padding: 16px 32px; border-radius: 12px;">
          ${input.code}
        </span>
      </div>
      <p style="font-size: 13px; color: #94a3b8; text-align: center; margin: 0 0 8px;">
        Ce code est valable <strong>10 minutes</strong>.
      </p>
      <p style="font-size: 13px; color: #94a3b8; text-align: center; margin: 0;">
        Ne partagez ce code avec personne.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
      <p style="font-size: 12px; color: #cbd5e1; text-align: center; margin: 0;">
        SIGMA Events — Billetterie et gestion d'événements
      </p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [input.to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error(`[resend] OTP ${res.status}: ${detail.slice(0, 200)}`);
      return { sent: false, via: "error" };
    }

    console.log(`[resend] ✓ OTP envoyé → ${input.to}`);
    return { sent: true, via: "resend" };
  } catch (e) {
    console.error("[resend] erreur envoi OTP", e);
    return { sent: false, via: "error" };
  }
}
