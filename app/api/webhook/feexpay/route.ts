import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/app/generated/prisma/enums";
import {
  isFeexPayEnabled,
  verifyFeexPayWebhookSignature,
  verifyFeexPayTransaction,
  feexPayAmount,
} from "@/lib/feexpay";
import { confirmOrderPaid } from "@/lib/shop";
import { notifyOrderPaid } from "@/lib/order-events";
import { withErrorCapture } from "@/lib/sentry";

export const dynamic = "force-dynamic";

// Webhook FeexPay : confirmation du paiement mobile money / carte.
//
// Flux :
//   1. /acheter/payer → initiateFeexPayPayment crée un lien → redirection client
//   2. Le client paie sur la page FeexPay (MTN MoMo / Moov / Celtiis / carte)
//   3. FeexPay POST /api/webhook/feexpay avec la signature HMAC-SHA256
//   4. Le serveur vérifie la signature + vérifie la transaction (statut SUCCESS)
//   5. La commande passe PAID, les billets QR sont émis.
//
// Anti-fraude en couches :
//   a. signature du webhook (HMAC-SHA256)
//   b. vérification serveur de la transaction (statut SUCCESS)
//   c. double contrôle du montant
//   d. verrou atomique anti-redélivrance
export const POST = withErrorCapture(async function POST(request: Request) {
  if (!isFeexPayEnabled()) {
    return NextResponse.json({ ok: false, error: "FEEXPAY_NOT_CONFIGURED" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-feexpay-signature") || request.headers.get("x-signature");
  if (!verifyFeexPayWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "INVALID_SIGNATURE" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  const transactionId = String(payload.id ?? payload.transaction_id ?? "");
  const status = String(payload.status ?? "").toUpperCase();
  const isSuccess = status === "SUCCESS" || status === "COMPLETED" || status === "PAID";
  const payloadAmount = Number(payload.amount);

  if (!transactionId) {
    return NextResponse.json({ ok: false, error: "NO_TRANSACTION_ID" }, { status: 400 });
  }

  // Retrouve la commande :
  //   1. externalPaymentId = transactionId (webhook précédent)
  //   2. reference = description ou metadata contenant la référence
  let order = await prisma.order.findUnique({ where: { externalPaymentId: transactionId } });

  if (!order) {
    // Cherche par référence dans la description ou metadata
    const metadata = payload.metadata && typeof payload.metadata === "object" ? (payload.metadata as Record<string, unknown>) : null;
    const ref = String(payload.reference ?? payload.description ?? metadata?.reference ?? "");
    if (ref.startsWith("SIG-")) {
      order = await prisma.order.findUnique({ where: { reference: ref } });
    }
  }

  if (!order) {
    return NextResponse.json({ ok: true, ignored: "unknown_payment" });
  }

  // Événement d'échec : on trace et on répond 200 pour éviter les rejeux.
  if (!isSuccess) {
    await prisma.order.update({
      where: { id: order.id },
      data: { externalStatus: `failed:${status.slice(0, 40)}` },
    });
    return NextResponse.json({ ok: true, status: "failed" });
  }

  // Déjà confirmé (redélivrance du webhook) : idempotent.
  if (order.status === OrderStatus.PAID) {
    return NextResponse.json({ ok: true, already: true });
  }

  // 🔒 Autorité anti-fraude : vérification serveur de la transaction.
  const verified = await verifyFeexPayTransaction(transactionId);
  if (!verified || (verified.status !== "SUCCESS" && verified.status !== "COMPLETED" && verified.status !== "PAID")) {
    await prisma.order.update({
      where: { id: order.id },
      data: { externalStatus: `verify_failed:${String(verified?.status ?? "unknown").slice(0, 40)}` },
    });
    return NextResponse.json({ ok: false, error: "VERIFICATION_FAILED" }, { status: 409 });
  }

  // 🔒 Double contrôle du montant.
  const expectedFcfa = feexPayAmount(order);
  const amountMatches =
    verified.amount === expectedFcfa ||
    (!Number.isFinite(payloadAmount) || payloadAmount === expectedFcfa);
  if (!amountMatches) {
    await prisma.order.update({
      where: { id: order.id },
      data: { externalStatus: `amount_mismatch:${verified.amount}` },
    });
    return NextResponse.json({ ok: false, error: "AMOUNT_MISMATCH" }, { status: 409 });
  }

  // 🔒 Verrou atomique anti-redélivrance.
  const lock = await prisma.order.updateMany({
    where: { id: order.id, status: OrderStatus.PENDING },
    data: {
      externalPaymentId: transactionId,
      externalProvider: "feexpay",
      externalStatus: "confirming",
    },
  });
  if (lock.count === 0) {
    return NextResponse.json({ ok: true, already: true });
  }

  const result = await confirmOrderPaid(order.id, {
    paymentMethod: order.paymentMethod ? `${order.paymentMethod}_FEEXPAY` : "FEEXPAY",
    delivery: order.deliveryMethod ?? undefined,
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
  }

  await notifyOrderPaid(order.id);
  return NextResponse.json({ ok: true });
});
