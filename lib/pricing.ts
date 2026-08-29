// Modèle économique SIGMA EVENTS — constantes et calculs purs.
//
//  Le CLIENT paie :
//    prix_billet + 50 FCFA (frais de service) + 2% du prix_billet
//    Ces 2% = 1.7% (commission FeexPay) + 0.3% (marge Sigma)
//
//  L'ORGANISATEUR reçoit :
//    prix_billet − 3% (commission Sigma)
//
//  Sigma paie FeexPay :
//    1.7% du prix billet (pas du total client)
//
//  Le client ne voit PAS la commission FeexPay — elle est absorbée par les 2%.

// Frais de service du billet : unifiés à 50 FCFA par commande.
export const DELIVERY_FEE = 50;

// Marge client totale : 2% du prix billet.
//  = 1.7% commission FeexPay + 0.3% marge Sigma (précaution)
export const CLIENT_MARGIN = 0.02;

// Commission FeexPay : 1.7% du prix billet (payée par Sigma, pas par le client).
export const FEEXPAY_FEE = 0.017;

// Marge Sigma dans la marge client : 0.3% (précaution)
export const SIGMA_BUFFER = 0.003;

// Commission Sigma sur l'organisateur : 3% du prix billet.
export const SIGMA_COMMISSION = 0.03;

// Montant total payé par le client :
//   prix_billet + 50 + (prix_billet × 2%)
//   = prix_billet × 1.02 + 50
//
// Billet gratuit (0 F) : aucune livraison ni frais — le client ne paie rien.
export function clientTotal(order: { amount: number; deliveryFee?: number | null }): number {
  if (order.amount <= 0) return 0;
  const withMargin = Math.round(order.amount * (1 + CLIENT_MARGIN));
  return withMargin + (order.deliveryFee || DELIVERY_FEE);
}

// Commission Sigma prélevée sur l'organisateur : 3% du prix billet.
// L'organisateur reçoit : prix_billet − commission.
export function sigmaCommission(ticketPrice: number): number {
  return Math.round(ticketPrice * SIGMA_COMMISSION);
}

// Montant net reçu par l'organisateur.
export function organizerNet(ticketPrice: number): number {
  return ticketPrice - sigmaCommission(ticketPrice);
}

// Montant que Sigma doit payer à FeexPay : 1.7% du prix billet.
// Sigma paie FeexPay directement (pas le client).
export function feexPayFee(ticketPrice: number): number {
  return Math.round(ticketPrice * FEEXPAY_FEE);
}

// Montant net reçu par Sigma après paiement FeexPay :
//   (3% commission + 2% marge client + 50 FCFA) − 1.7% FeexPay
export function sigmaNet(ticketPrice: number): number {
  const commission = sigmaCommission(ticketPrice);
  const clientMargin = Math.round(ticketPrice * CLIENT_MARGIN);
  const deliveryFee = DELIVERY_FEE;
  const feexPay = feexPayFee(ticketPrice);
  return commission + clientMargin + deliveryFee - feexPay;
}
