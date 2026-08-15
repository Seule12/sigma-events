import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/app/generated/prisma/enums";
import { verifyWebhookSignature } from "@/lib/payments";
import { confirmOrderPaid, clientTotal } from "@/lib/shop";
import { notifyOrderPaid } from "@/lib/order-events";

export const dynamic = "force-dynamic";

// Nom de l'en-tête de signature — configurable via DODO_SIGNATURE_HEADER.
// Dodo suit la spec Standard Webhooks : l'en-tête s'appelle « webhook-signature »
// (avec webhook-id + webhook-timestamp). Les autres noms sont des fallbacks
// pour les anciennes versions / proxys.
function signatureHeader(request: Request): string | null {
  const configured = process.env.DODO_SIGNATURE_HEADER;
  const candidates = [
    configured,
    "webhook-signature",
    "dodo-signature",
    "x-dodo-signature",
  ].filter(Boolean) as string[];
  for (const name of candidates) {
    const value = request.headers.get(name);
    if (value) return value;
  }
  return null;
}

// Webhook Dodo Payments : confirmation du paiement mobile money (HTTPS requis
// en production — la clé DODO_WEBHOOK_SECRET n'est jamais exposée).
//
// Flux réel :
//   1. /acheter/payer → initiation du paiement chez Dodo (lib/payments.ts)
//   2. le client paie sur le checkout Dodo (MTN MoMo / Moov Money / Celtiis Cash)
//   3. Dodo POST /api/webhook/dodo (signature HMAC-SHA256 vérifiée ci-dessous)
//   4. la commande passe PAID, les billets QR sont émis, l'organisateur notifié
//
// Signature (spec Standard Webhooks) : HMAC-SHA256 de
// `webhook-id + "." + webhook-timestamp + "." + rawBody` avec DODO_WEBHOOK_SECRET.
// Payload : les données métier sont sous `data.*` (payment_id, status,
// total_amount en minor units — centimes pour une devise à 2 décimales).
export async function POST(request: Request) {
  // Le payload brut est nécessaire au HMAC : on le lit en texte.
  const rawBody = await request.text();
  const id = request.headers.get("webhook-id");
  const timestamp = request.headers.get("webhook-timestamp");
  const signature = signatureHeader(request);

  if (!verifyWebhookSignature(rawBody, { id, timestamp, signature })) {
    return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  // Spec Standard Webhooks : les données métier sont dans `data` (en plus des
  // champs racine historiques qu'on garde en fallback).
  const data = (payload.data && typeof payload.data === "object" ? payload.data : {}) as Record<string, unknown>;
  const paymentId = String(data.payment_id ?? payload.payment_id ?? payload.id ?? "");
  const status = String(data.status ?? payload.status ?? payload.event_type ?? "");
  // Whitelist EXACTE des statuts de succès : un statut comme « partially_paid »
  // contient la sous-chaîne « paid » et ne doit JAMAIS confirmer une commande.
  const SUCCESS_STATUSES = new Set(["succeeded", "completed", "paid", "success"]);
  const completed =
    SUCCESS_STATUSES.has(status.trim().toLowerCase()) ||
    String(payload.type ?? "").includes("succeeded");

  if (!paymentId) {
    return NextResponse.json({ ok: false, error: "NO_PAYMENT_ID" }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { externalPaymentId: paymentId },
    include: { event: true },
  });
  if (!order) {
    // Paiement inconnu : on accuse réception sans confirmer (rien à confirmer).
    return NextResponse.json({ ok: true, ignored: "unknown_payment" });
  }

  // Événements non-liés au succès (failed, pending…) : on trace le statut et on
  // répond 200 pour éviter les rejeux inutiles.
  if (!completed) {
    await prisma.order.update({
      where: { id: order.id },
      data: { externalStatus: status.slice(0, 40) || "unknown" },
    });
    return NextResponse.json({ ok: true, status });
  }

  // Paiement déjà confirmé : idempotent (les webhooks sont parfois redélivrés).
  if (order.status === OrderStatus.PAID) {
    return NextResponse.json({ ok: true, already: true });
  }

  // 🔒 Anti-fraude : le montant reçu doit correspondre à la commande — prix tout
  // compris (billets + livraison) avec gross-up FedaPay (clientTotal), en minor
  // units (×100) ou en unités majeures. Un paiement partiel ou surévalué est
  // refusé — on ne confirme jamais.
  const expectedFcfa = clientTotal(order);
  const receivedRaw = Number(data.total_amount ?? data.amount ?? payload.total_amount ?? payload.amount);
  const receivedMinor = Number.isFinite(receivedRaw) ? receivedRaw : NaN;
  // Dodo envoie les montants en minor units ; on accepte aussi l'unité majeure
  // (montant exact) au cas où le webhook serait configuré différemment.
  const amountMatches =
    Number.isFinite(receivedMinor) &&
    (receivedMinor === expectedFcfa || receivedMinor === expectedFcfa * 100);
  if (!amountMatches) {
    await prisma.order.update({
      where: { id: order.id },
      data: { externalStatus: `amount_mismatch:${String(receivedMinor)}` },
    });
    return NextResponse.json({ ok: false, error: "AMOUNT_MISMATCH" }, { status: 409 });
  }

  const result = await confirmOrderPaid(order.id, {
    // Méthode lisible sur la facture : ex. « MTN_MOMO_DODO » pour distinguer
    // un paiement réel d'un paiement simulé (suffixe _DEMO).
    paymentMethod: order.paymentMethod ? `${order.paymentMethod}_DODO` : "DODO",
    // Livraison choisie par le client AVANT l'initiation (stockée sur la commande) :
    // le webhook la transmet pour déclencher l'envoi (email / WhatsApp) et le frais.
    delivery: order.deliveryMethod ?? undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  }

  await notifyOrderPaid(order.id);
  return NextResponse.json({ ok: true });
}
