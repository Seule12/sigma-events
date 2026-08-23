// Paiement mobile money réel — passerelle FeexPay (feexpay.me).
//
// - Réseaux : MTN MoMo / Moov Money / Celtiis Cash + cartes bancaires
// - API : https://api.feexpay.me/v1
// - Auth : Bearer {clé_privée} + identifiant marchand
//
// Flux :
//   1. POST /v1/payment-links → crée un lien de paiement → redirection client
//   2. Client paie sur la page FeexPay (Mobile Money ou carte)
//   3. FeexPay POST /api/webhook/feexpay (notification)
//   4. GET /v1/transactions/{id} → vérification serveur (statut + montant)
//   5. Commande confirmée, billets émis.
//
// Credentials :
//   FEEXPAY_PRIVATE_KEY  = clé privée (fp_...)
//   FEEXPAY_IDENTIFIER   = identifiant marchand
//   FEEXPAY_MODE         = LIVE | SANDBOX (défaut : LIVE)

import crypto from "node:crypto";
import { clientTotal } from "@/lib/shop";

const FEEXPAY_API_BASE = "https://api.feexpay.me/v1";

function feexPayConfig() {
  return {
    privateKey: process.env.FEEXPAY_PRIVATE_KEY || "",
    identifier: process.env.FEEXPAY_IDENTIFIER || "",
    mode: (process.env.FEEXPAY_MODE || "LIVE").toUpperCase(),
  };
}

export function isFeexPayEnabled(): boolean {
  const { privateKey, identifier } = feexPayConfig();
  return Boolean(privateKey && identifier);
}

export type FeexPayInitResult =
  | { mode: "demo" }
  | { mode: "feexpay"; paymentUrl: string; transactionId: string };

/**
 * Initie un paiement via FeexPay.
 * Crée un lien de paiement et retourne l'URL où le client sera redirigé.
 */
export async function initiateFeexPayPayment(input: {
  orderId: string;
  reference: string;
  amount: number; // FCFA
  customerName: string;
  customerEmail?: string | null;
  customerPhone: string;
  eventName: string;
  network?: string; // MTN_MOMO | MOOV_MONEY | CELTIIS
}): Promise<FeexPayInitResult> {
  const { privateKey, identifier } = feexPayConfig();
  if (!privateKey || !identifier) return { mode: "demo" };

  const callbackUrl = `${process.env.APP_URL || "http://localhost:3000"}/api/webhook/feexpay`;
  const redirectUrl = `${process.env.APP_URL || "http://localhost:3000"}/acheter/confirmation/${input.orderId}`;

  // Mapping réseau SIGMA → FeexPay
  const networkMap: Record<string, string> = {
    MTN_MOMO: "MTN",
    MOOV_MONEY: "MOOV",
    CELTIIS: "ORANGE",
  };
  const feexNetwork = networkMap[input.network ?? ""] || "MTN";

  const body = {
    shop: identifier,
    amount: input.amount,
    phone: input.customerPhone.replace(/\s/g, ""),
    name: input.customerName.slice(0, 100),
    email: input.customerEmail || "client@sigma.bj",
    network: feexNetwork,
    callback_url: callbackUrl,
    redirect_url: redirectUrl,
    description: `${input.eventName} — ${input.reference}`,
  };

  const res = await fetch(`${FEEXPAY_API_BASE}/payment`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${privateKey}`,
      "Content-Type": "application/json",
      "X-Identifiant": identifier,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`FeexPay createPayment ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    id?: string;
    payment_url?: string;
    url?: string;
    status?: string;
    message?: string;
  };

  const transactionId = data.id || "";
  const paymentUrl = data.payment_url || data.url || "";

  if (!paymentUrl) {
    throw new Error("FeexPay createPayment : réponse incomplète (payment_url manquant)");
  }

  return { mode: "feexpay", paymentUrl, transactionId };
}

export type FeexPayVerifiedTransaction = {
  status: string;
  amount: number;
  transactionId: string;
};

/**
 * Vérifie le statut d'une transaction FeexPay.
 * GET /v1/transactions/{id} → status + amount
 */
export async function verifyFeexPayTransaction(
  transactionId: string
): Promise<FeexPayVerifiedTransaction | null> {
  const { privateKey, identifier } = feexPayConfig();
  if (!privateKey || !identifier) return null;

  try {
    const res = await fetch(`${FEEXPAY_API_BASE}/transactions/${transactionId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${privateKey}`,
        "X-Identifiant": identifier,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    return {
      status: String(data.status ?? "").toUpperCase(),
      amount: Number(data.amount) || 0,
      transactionId: String(data.id ?? transactionId),
    };
  } catch {
    return null;
  }
}

/**
 * Vérifie la signature du webhook FeexPay.
 * La signature est un HMAC-SHA256 du body avec la clé privée.
 */
export function verifyFeexPayWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const { privateKey } = feexPayConfig();
  if (!signatureHeader || !privateKey) return false;
  try {
    const hmac = crypto.createHmac("sha256", privateKey).update(rawBody).digest("hex");
    const a = Buffer.from(signatureHeader.trim());
    const b = Buffer.from(hmac);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    // Fallback : comparaison directe (certains webhooks envoient le secret brut)
    const c = Buffer.from(privateKey);
    if (a.length === c.length && crypto.timingSafeEqual(a, c)) return true;
  } catch {
    /* format invalide → rejet */
  }
  return false;
}

/**
 * Montant total à facturer (billets + frais de livraison, gross-up FedaPay).
 */
export function feexPayAmount(order: { amount: number; deliveryFee?: number | null }): number {
  return clientTotal(order);
}
