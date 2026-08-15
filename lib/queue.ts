import "server-only";
import amqp from "amqplib";

// File d'attente des emails transactionnels (CloudAMQP / RabbitMQ).
// Les jobs sont consommés par le worker scripts/email-worker.ts (ou un worker
// de production) qui envoie réellement les emails.
const EMAIL_QUEUE = "sigma.emails";

export type EmailJob =
  | {
      type: "otp";
      to: string;
      name: string;
      code: string;
    }
  | {
      type: "ticket";
      to: string;
      customerName: string;
      eventName: string;
      reference: string;
      ticketCount: number;
      amount: number;
      ticketUrl: string;
    }
  | {
      type: "invoice";
      to: string;
      customerName: string;
      eventName: string;
      reference: string;
      amount: number;
      deliveryFee: number;
      ticketUrl: string;
    };

// Publie un job d'email sur la file (fire-and-forget : jamais bloquant).
// Si CloudAMQP n'est pas configuré, on journalise et on continue (mode dégradé).
export async function enqueueEmail(job: EmailJob): Promise<void> {
  if (!process.env.CLOUDAMQP_URL) {
    // Mode dégradé : journaliser sans jamais exposer le code OTP ni les données sensibles.
    const safe = { ...job, ...(job.type === "otp" ? { code: "••••••" } : {}) };
    console.log("[mail:degraded]", JSON.stringify(safe));
    return;
  }
  let conn: Awaited<ReturnType<typeof amqp.connect>> | null = null;
  try {
    conn = await amqp.connect(process.env.CLOUDAMQP_URL, { timeout: 10_000 });
    const ch = await conn.createChannel();
    await ch.assertQueue(EMAIL_QUEUE, { durable: true });
    ch.sendToQueue(EMAIL_QUEUE, Buffer.from(JSON.stringify(job)), { persistent: true });
    await ch.close();
  } catch (e) {
    console.error("[queue] email non mis en file", e);
  } finally {
    try {
      await conn?.close();
    } catch {
      /* déjà fermée */
    }
  }
}
