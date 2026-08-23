// Paiement mobile money réel — abstraction passerelle (FeexPay).
//
// - Mode démo (défaut) : pas de FEEXPAY_PRIVATE_KEY → le flux simulé existant
//   continue (aucun débit réel).
// - Mode réel : FEEXPAY_PRIVATE_KEY + FEEXPAY_IDENTIFIER configurés →
//   initiation d'un paiement via FeexPay, le client est redirigé vers la page
//   de paiement FeexPay, et le webhook /api/webhook/feexpay confirme.
//
// Docs : https://docs.feexpay.me/

import { isFeexPayEnabled, initiateFeexPayPayment, type FeexPayInitResult } from "@/lib/feexpay";

export function isRealPaymentEnabled(): boolean {
  return isFeexPayEnabled();
}

export type InitiatePaymentResult =
  | { mode: "demo" }
  | { mode: "feexpay"; redirectUrl: string; paymentId: string };

/**
 * Initie un paiement mobile money pour une commande.
 * En mode réel : crée le paiement chez FeexPay et retourne le lien de checkout.
 * En mode démo : retourne { mode: "demo" } (le flux simulé prend le relais).
 */
export async function initiatePayment(input: {
  orderId: string;
  reference: string;
  amount: number; // FCFA
  customerName: string;
  customerEmail?: string | null;
  customerPhone: string;
  eventName: string;
  network?: string; // MTN_MOMO | MOOV_MONEY | CELTIIS
}): Promise<InitiatePaymentResult> {
  const result = await initiateFeexPayPayment(input);

  if (result.mode === "demo") {
    return { mode: "demo" };
  }

  return {
    mode: "feexpay",
    redirectUrl: result.paymentUrl,
    paymentId: result.transactionId,
  };
}
