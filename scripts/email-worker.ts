// Worker de traitement des emails (file CloudAMQP / RabbitMQ).
// Consomme la queue « sigma.emails » et envoie chaque email via Resend.
//
// - Envoi réel quand RESEND_API_KEY est configurée et que le destinataire
//   est une adresse email (les OTP SMS partent par téléphone → ignorés ici).
// - Sans clé : mode dégradé (journalisation), l'email n'est pas perdu mais tracé.
//
// Lancement : npx tsx scripts/email-worker.ts
import "dotenv/config";
import http from "node:http";
import amqp from "amqplib";
import { Resend } from "resend";
import type { EmailJob } from "../lib/queue";

const EMAIL_QUEUE = "sigma.emails";

/** Erreur d'envoi : retryable = erreur transitoire (rate limit / 5xx) à retenter. */
class EmailSendError extends Error {
  retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.name = "EmailSendError";
    this.retryable = retryable;
  }
}

// ===== Transport Resend =====
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const EMAIL_FROM =
  process.env.EMAIL_FROM || "Sigma Security <sigma@sigma-security.bj>";

/** Vrai si la chaîne ressemble à une adresse email (sinon : SMS / téléphone). */
function isEmailAddress(to: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim());
}

// ===== Templates HTML =====
function otpHtml(name: string, code: string): string {
  return `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;background:#0f172a;border-radius:16px;overflow:hidden">
  <div style="padding:24px;background:linear-gradient(135deg,#052e2b,#065f46)">
    <p style="margin:0;color:#a7f3d0;font-size:12px;letter-spacing:2px;font-weight:700">SIGMA SECURITY BÉNIN</p>
    <h1 style="margin:8px 0 0;color:#fff;font-size:18px">Votre code de vérification</h1>
  </div>
  <div style="padding:24px;background:#fff">
    <p style="color:#475569;font-size:14px">Bonjour <b>${name}</b>,</p>
    <p style="color:#475569;font-size:14px">Utilisez ce code pour finaliser la création de votre compte :</p>
    <p style="text-align:center;font-size:32px;letter-spacing:8px;font-weight:800;color:#047857;margin:16px 0">${code}</p>
    <p style="color:#94a3b8;font-size:12px">Ce code expire dans 10 minutes. Ne le partagez avec personne.</p>
  </div>
  <div style="padding:16px;text-align:center;color:#64748b;font-size:11px">© 2026 Sigma Security Bénin — Tous droits réservés</div>
</div>`;
}

function ticketHtml(job: Extract<EmailJob, { type: "ticket" | "invoice" }>): string {
  const isTicket = job.type === "ticket";
  return `
<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;background:#0f172a;border-radius:16px;overflow:hidden">
  <div style="padding:24px;background:linear-gradient(135deg,#052e2b,#065f46)">
    <p style="margin:0;color:#a7f3d0;font-size:12px;letter-spacing:2px;font-weight:700">SIGMA SECURITY BÉNIN</p>
    <h1 style="margin:8px 0 0;color:#fff;font-size:18px">${isTicket ? "Votre billet est confirmé" : "Votre facture"}</h1>
  </div>
  <div style="padding:24px;background:#fff">
    <p style="color:#475569;font-size:14px">Bonjour <b>${job.customerName}</b>,</p>
    <p style="color:#475569;font-size:14px">
      ${isTicket
        ? `Votre ${job.ticketCount > 1 ? `${job.ticketCount} billets` : "billet"} pour <b>${job.eventName}</b> est confirmé.`
        : `Merci pour votre achat à <b>${job.eventName}</b>. Voici votre facture.`}
    </p>
    <div style="background:#f8fafc;border-radius:12px;padding:16px;margin:16px 0">
      <p style="margin:0;color:#475569;font-size:14px">Référence : <b style="color:#047857">${job.reference}</b></p>
      <p style="margin:8px 0 0;color:#475569;font-size:14px">Montant ${isTicket ? "total" : ""} : <b style="color:#047857">${job.amount.toLocaleString("fr-FR")} FCFA</b>${!isTicket && job.deliveryFee ? `<br><span style="color:#94a3b8;font-size:12px">dont livraison ${job.deliveryFee} FCFA</span>` : ""}</p>
    </div>
    ${job.ticketUrl ? `<p style="text-align:center;margin:16px 0"><a href="${job.ticketUrl}" style="background:#047857;color:#fff;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:700">VOIR MON BILLET</a></p>` : ""}
    <p style="color:#94a3b8;font-size:12px">Présentez votre QR code à l'entrée. Un seul scan autorisé.</p>
  </div>
  <div style="padding:16px;text-align:center;color:#64748b;font-size:11px">© 2026 Sigma Security Bénin — Tous droits réservés</div>
</div>`;
}

// ===== « Envoi » réel (Resend) =====
async function sendEmail(job: EmailJob): Promise<void> {
  let subject = "";
  let html = "";
  switch (job.type) {
    case "otp":
      subject = `Votre code de vérification Sigma — ${job.code}`;
      html = otpHtml(job.name, job.code);
      break;
    case "ticket":
      subject = `Votre billet — ${job.eventName} (${job.reference})`;
      html = ticketHtml(job);
      break;
    case "invoice":
      subject = `Votre facture — ${job.eventName} (${job.reference})`;
      html = ticketHtml(job);
      break;
  }

  // Les OTP partent par SMS (destinataire = téléphone) : hors périmètre email,
  // on trace sans jamais exposer le code.
  if (!isEmailAddress(job.to)) {
    const safeSubject = job.type === "otp" ? subject.replace(job.code, "••••••") : subject;
    console.log(`[mail] ${job.to} : destinataire non-email (canal SMS) — ignoré\n  sujet : ${safeSubject}`);
    return;
  }

  // Mode dégradé : pas de clé Resend → on journalise (sujet sécurisé).
  if (!resend) {
    const safeSubject = job.type === "otp" ? subject.replace(job.code, "••••••") : subject;
    console.log(`[mail] mode dégradé (RESEND_API_KEY absente) → ${job.to}\n  sujet : ${safeSubject}\n  html  : ${html.length} caractères`);
    return;
  }

  // Envoi réel via Resend.
  const { error } = await resend.emails.send({
    from: EMAIL_FROM,
    to: [job.to.trim()],
    subject,
    html,
  });
  if (error) {
    // 4xx définitifs (from non vérifié, destinataire invalide) → abandonner.
    // 429 / 5xx transitoires → retenter (requeue limitée côté worker).
    const status =
      typeof (error as { statusCode?: number }).statusCode === "number"
        ? (error as { statusCode?: number }).statusCode!
        : 0;
    const retryable = status >= 500 || status === 429;
    throw new EmailSendError(`Resend ${error.name}: ${error.message} (${status})`, retryable);
  }
  console.log(`[mail] ✓ envoyé via Resend → ${job.to} (${job.type})`);
}

/** Nombre de redélivrances déjà effectuées (header RabbitMQ x-death). */
function countRedeliveries(msg: amqp.ConsumeMessage): number {
  const death = msg.properties.headers?.["x-death"];
  if (Array.isArray(death) && death.length > 0) {
    const count = death[0]?.count;
    if (typeof count === "number") return count;
  }
  return 0;
}


// ===== Mini serveur HTTP (exigence Render) =====
// Le plan free de Render n'autorise que les web services : le worker est donc
// déclaré comme web service, et doit écouter sur le port $PORT pour que le
// health check passe. Il ne sert pas de trafic web.
const PORT = Number(process.env.PORT || 3001);
const healthServer = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("ok");
});
healthServer.listen(PORT, () => {
  console.log(`[worker] health check HTTP sur le port ${PORT}`);
});

async function main() {
  const url = process.env.CLOUDAMQP_URL;
  if (!url) {
    console.error("CLOUDAMQP_URL manquante — renseignez-la dans .env");
    process.exit(1);
  }
  const conn = await amqp.connect(url, { timeout: 15_000 });
  const ch = await conn.createChannel();
  await ch.assertQueue(EMAIL_QUEUE, { durable: true });
  ch.prefetch(1);
  console.log(`[worker] en écoute sur « ${EMAIL_QUEUE} » (CloudAMQP) — Ctrl+C pour arrêter`);

  await ch.consume(
    EMAIL_QUEUE,
    async (msg) => {
      if (!msg) return;
      try {
        const job = JSON.parse(msg.content.toString()) as EmailJob;
        await sendEmail(job);
        ch.ack(msg);
      } catch (e) {
        console.error("[worker] erreur job", e);
        const retryable = e instanceof EmailSendError && e.retryable;
        const redeliveries = countRedeliveries(msg);
        if (retryable && redeliveries < 3) {
          // Erreur transitoire (429/5xx) : on remet en file pour une nouvelle
          // tentative, bornée à 3 pour éviter la boucle infinie.
          console.warn(`[worker] erreur transitoire — requeue (tentative ${redeliveries + 1}/3)`);
          ch.nack(msg, false, true);
        } else {
          // Erreur définitive (4xx) ou tentatives épuisées : on abandonne.
          // La facture/billet est perdue pour ce client — à tracer via log.
          ch.nack(msg, false, false);
        }
      }
    },
    { noAck: false }
  );

  const shutdown = async () => {
    console.log("\n[worker] arrêt");
    await ch.close();
    await conn.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
