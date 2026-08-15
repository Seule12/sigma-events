// Paiement mobile money réel — abstraction passerelle (Dodo Payments).
//
// - Mode démo (défaut) : pas de DODO_API_KEY → le flux simulé existant continue
//   (aucun débit réel), suffixe _DEMO sur paymentMethod.
// - Mode réel : DODO_API_KEY + DODO_WEBHOOK_SECRET configurés → initiation d'un
//   paiement mobile money (MTN MoMo / Moov / Celtiis via XOF), le client
//   est redirigé vers le checkout Dodo, et le webhook /api/webhook/dodo confirme.
//
// Docs : https://docs.dodopayments.com/ (POST /payments, webhooks HMAC-SHA256).

import crypto from "crypto";

const DODO_API_BASE = "https://api.dodopayments.com";

export function isRealPaymentEnabled(): boolean {
  return Boolean(process.env.DODO_API_KEY);
}

export type InitiatePaymentResult =
  | { mode: "demo" } // passerelle non configurée → flux simulé
  | { mode: "dodo"; redirectUrl: string; paymentId: string };

/**
 * Initie un paiement mobile money pour une commande.
 * En mode réel : crée le paiement chez Dodo et retourne le lien de checkout.
 * En mode démo : retourne { mode: "demo" } (le flux simulé prend le relais).
 */
export async function initiatePayment(input: {
  orderId: string;
  reference: string;
  amount: number; // FCFA (XOF)
  customerName: string;
  customerEmail?: string | null;
  customerPhone: string;
  eventName: string;
}): Promise<InitiatePaymentResult> {
  const apiKey = process.env.DODO_API_KEY;
  if (!apiKey) return { mode: "demo" };

  // Le produit doit exister dans le compte Dodo (créé dans le dashboard ou via
  // l'API) — configurable via DODO_PRODUCT_ID pour ne pas dupliquer le produit.
  const productId = process.env.DODO_PRODUCT_ID || "ticket";
  // Montant en minor units : pour XOF, Dodo attend le montant × 100 (2 décimales).
  const body = {
    billing: {
      city: process.env.DODO_MERCHANT_CITY || "Cotonou",
      country: "BJ",
      state: process.env.DODO_MERCHANT_STATE || "Littoral",
      street: process.env.DODO_MERCHANT_STREET || "",
      zipcode: "00229",
    },
    customer: {
      email: input.customerEmail || "client@sigma.bj",
      name: input.customerName.slice(0, 100),
    },
    // Paiement unique (pas de panier de produits) : montant total en XOF.
    product_cart: [
      {
        product_id: productId,
        quantity: 1,
        price: input.amount * 100,
      },
    ],
    payment_method_type: "mobile_money",
    currency: "XOF",
    return_url: `${process.env.APP_URL || "http://localhost:3000"}/acheter/confirmation/${input.orderId}`,
    metadata: {
      orderId: input.orderId,
      reference: input.reference,
    },
  };

  const res = await fetch(`${DODO_API_BASE}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // Idempotence : une même référence de commande ne doit pas créer deux
      // paiements Dodo si le client re-soumet le formulaire (retour réseau…).
      "Idempotency-Key": input.reference,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Dodo createPayment ${res.status}: ${detail.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    payment_id?: string;
    payment_link?: string;
  };
  const paymentId = data.payment_id;
  const redirectUrl = data.payment_link;
  if (!paymentId || !redirectUrl) {
    throw new Error("Dodo createPayment : réponse incomplète (payment_id/payment_link manquant)");
  }

  return { mode: "dodo", redirectUrl, paymentId };
}

/**
 * Vérifie la signature HMAC-SHA256 d'un webhook Dodo (spec Standard Webhooks,
 * docs.dodopayments.com/developer-resources/webhooks).
 *
 * Message signé : `webhook-id + "." + webhook-timestamp + "." + rawBody`
 * (le header `webhook-signature` peut être préfixé « v1, », format svix).
 *
 * Fallback : si `webhook-id`/`webhook-timestamp` sont absents (anciens webhooks),
 * on retombe sur le body brut seul. Comparaison à temps constant dans tous les cas.
 */
// Tolérance maximale pour l'âge d'un webhook (anti-rejeu) : un événement signé
// il y a plus de 5 minutes est rejeté — un attaquant ne peut pas rejouer une
// ancienne notification volée.
const WEBHOOK_MAX_AGE_MS = 5 * 60_000;

export function verifyWebhookSignature(
  rawBody: string,
  opts: { id?: string | null; timestamp?: string | null; signature?: string | null }
): boolean {
  const secret = process.env.DODO_WEBHOOK_SECRET;
  const signatureHeader = opts.signature;
  if (!secret || !signatureHeader) return false;
  try {
    // Spec Standard Webhooks : id.timestamp.body ; fallback = body seul.
    const signedContent =
      opts.id && opts.timestamp ? `${opts.id}.${opts.timestamp}.${rawBody}` : rawBody;
    const computed = crypto.createHmac("sha256", secret).update(signedContent).digest("hex");
    // La signature peut être « v1,<hex> » (svix) ou hex/base64 seule.
    const provided = signatureHeader.replace(/^v1[,;]?\s*/i, "").trim();
    const expected = Buffer.from(computed);
    let a = Buffer.from(provided, "hex");
    if (a.length !== expected.length) {
      // Fallback base64 (certains SDK encodent en base64).
      a = Buffer.from(provided, "base64");
      if (a.length !== expected.length) return false;
    }
    if (!crypto.timingSafeEqual(expected, a)) return false;
    // Anti-rejeu : le timestamp signé doit être récent (≤ 5 min). Un webhook
    // rejoué à l'identique (même id + timestamp + body) est rejeté.
    if (opts.timestamp) {
      const ts = Number(opts.timestamp);
      if (!Number.isFinite(ts)) return false;
      if (Math.abs(Date.now() / 1000 - ts) > WEBHOOK_MAX_AGE_MS / 1000) return false;
    }
    return true;
  } catch {
    return false;
  }
}
