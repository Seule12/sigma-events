import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/app/generated/prisma/enums";
import {
  isKkiapayEnabled,
  verifyKkiapayWebhookSignature,
  verifyKkiapayTransaction,
  refundKkiapayTransaction,
  kkiapayAmount,
} from "@/lib/kkiapay";
import { confirmOrderPaid } from "@/lib/shop";
import { notifyOrderPaid } from "@/lib/order-events";

export const dynamic = "force-dynamic";

// Webhook KKIAPAY : confirmation du paiement mobile money.
//
// Flux réel :
//   1. /acheter/payer → simulatePaymentAction enregistre la livraison puis
//      redirige vers ?kkiapay=1 (page qui ouvre le widget openKkiapayWidget)
//   2. le client paie dans le widget KKIAPAY (MTN MoMo / Moov Money / Celtiis Cash)
//   3. KKIAPAY redirige vers le callback (page de confirmation) ET POST
//      /api/webhook/kkiapay avec l'en-tête `x-kkiapay-secret`
//   4. le serveur vérifie la signature + appelle l'API de vérification
//      (status SUCCESS + montant exact) → la commande passe PAID, billets émis.
//
// Signature : l'en-tête `x-kkiapay-secret` contient le secret hash configuré
// dans le dashboard KKIAPAY (comparaison directe, fallback HMAC-SHA256 du body).
// Payload : { transactionId, isPaymentSucces, amount, partnerId, stateData, … } —
// le montant est en FCFA (unité majeure).
//
// Anti-fraude en couches :
//   a. signature du webhook (x-kkiapay-secret),
//   b. vérification serveur de la transaction (statut SUCCESS),
//   c. double contrôle du montant : payload signé ET réponse API,
//   d. verrou atomique anti-redélivrance (une seule confirmation par commande).
export async function POST(request: Request) {
  if (!isKkiapayEnabled()) {
    return NextResponse.json({ ok: false, error: "KKIAPAY_NOT_CONFIGURED" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-kkiapay-secret");
  if (!verifyKkiapayWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const transactionId = String(payload.transactionId ?? "");
  const isSuccess = payload.isPaymentSucces === true || String(payload.event ?? "").includes("success");
  const payloadAmount = Number(payload.amount);
  const partnerId = String(payload.partnerId ?? "");

  if (!transactionId) {
    return NextResponse.json({ ok: false, error: "NO_TRANSACTION_ID" }, { status: 400 });
  }

  // Retrouve la commande, par ordre de robustesse :
  //   1. partnerId = référence SIG-XXXXXX passée au widget (openKkiapayWidget),
  //   2. transactionId (redélivrance d'un 2ᵉ webhook après confirmation),
  //   3. stateData.orderId : le widget envoie aussi `data` (JSON) — KKIAPAY le
  //      renvoie dans stateData — canal documenté « infos liées à la transaction ».
  let order = partnerId
    ? await prisma.order.findUnique({ where: { reference: partnerId } })
    : null;
  if (!order) {
    order = await prisma.order.findUnique({ where: { externalPaymentId: transactionId } });
  }
  if (!order) {
    const stateData = payload.stateData && typeof payload.stateData === "object"
      ? (payload.stateData as Record<string, unknown>)
      : null;
    const orderId = stateData?.orderId ? String(stateData.orderId) : "";
    if (orderId) {
      order = await prisma.order.findUnique({ where: { id: orderId } });
    }
  }
  if (!order) {
    // Paiement inconnu : on accuse réception sans confirmer (rien à confirmer).
    return NextResponse.json({ ok: true, ignored: "unknown_payment" });
  }

  // Événement d'échec : on trace et on répond 200 pour éviter les rejeux.
  if (!isSuccess) {
    await prisma.order.update({
      where: { id: order.id },
      data: { externalStatus: "failed" },
    });
    return NextResponse.json({ ok: true, status: "failed" });
  }

  // Déjà confirmé (redélivrance du webhook) : idempotent.
  if (order.status === OrderStatus.PAID) {
    return NextResponse.json({ ok: true, already: true });
  }

  // 🔒 Autorité anti-fraude : vérification serveur de la transaction (statut
  // SUCCESS + montant). Sans cet appel, rien n'est confirmé : un webhook forgé
  // ou rejoué ne peut pas faire passer une commande à PAID.
  const verified = await verifyKkiapayTransaction(transactionId);
  if (!verified || verified.status !== "SUCCESS") {
    await prisma.order.update({
      where: { id: order.id },
      data: { externalStatus: `verify_failed:${String(verified?.status ?? "unknown").slice(0, 40)}` },
    });
    return NextResponse.json({ ok: false, error: "VERIFICATION_FAILED" }, { status: 409 });
  }

  // 🔒 Double contrôle du montant : le payload signé ET la réponse API doivent
  // tous deux correspondre à la commande (billets + frais de livraison). Un
  // paiement partiel ou surévalué est refusé dans les deux cas.
  const expectedFcfa = kkiapayAmount(order);
  const amountMatches =
    verified.amount === expectedFcfa &&
    (!Number.isFinite(payloadAmount) || payloadAmount === expectedFcfa);
  if (!amountMatches) {
    await prisma.order.update({
      where: { id: order.id },
      data: { externalStatus: `amount_mismatch:${verified.amount}` },
    });
    return NextResponse.json({ ok: false, error: "AMOUNT_MISMATCH" }, { status: 409 });
  }

  // 🔒 Verrou atomique anti-redélivrance : KKIAPAY retente jusqu'à 5 fois.
  // Deux webhooks concurrents ne peuvent pas confirmer la même commande deux
  // fois (la mise à jour conditionnelle sur status PENDING n'en laisse passer
  // qu'un). Le perdant répond 200 (rien à faire).
  const lock = await prisma.order.updateMany({
    where: { id: order.id, status: OrderStatus.PENDING },
    data: {
      externalPaymentId: transactionId,
      externalProvider: "kkiapay",
      externalStatus: "confirming",
    },
  });
  if (lock.count === 0) {
    return NextResponse.json({ ok: true, already: true });
  }

  const result = await confirmOrderPaid(order.id, {
    // Méthode lisible sur la facture : « KKIAPAY » (paiement réel, pas _DEMO).
    paymentMethod: "KKIAPAY",
    // Livraison choisie par le client AVANT l'initiation (stockée sur la
    // commande) : le webhook la transmet pour déclencher l'envoi + le frais.
    delivery: order.deliveryMethod ?? undefined,
  });
  if (!result.ok) {
    // Le client a payé mais la commande ne peut pas être honorée (capacité
    // dépassée, commande expirée…) : on rembourse automatiquement plutôt que
    // de laisser un paiement sans billet.
    await refundKkiapayTransaction(transactionId).catch(() => {});
    await prisma.order.update({
      where: { id: order.id },
      data: { externalStatus: `refunded:${result.error}` },
    });
    return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  }

  await notifyOrderPaid(order.id);
  return NextResponse.json({ ok: true });
}
