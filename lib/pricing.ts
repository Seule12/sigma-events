// Modèle économique (brief sigma-events-commissions-brief-1.md) — constantes
// et calculs purs, SANS dépendance serveur (utilisable depuis des composants client).
//
//  - Frais de service UNIFIÉS à 50 FCFA par commande, quel que soit le canal
//    (non mentionnés au client ni à l'organisateur).
//  - La commission (~3 %) est intégrée au prix affiché par GROSS-UP :
//    prix_affiché_client = prix_net / (1 − marge). Le client paie un prix tout
//    compris ; SIGMA garde la marge.
//  - La commission Sigma (3 % par défaut du prix billet) reste chez SIGMA ;
//    l'organisateur reçoit prix billet − commission.

// Frais de service du billet : unifiés à 50 FCFA par commande.
export const DELIVERY_FEE = 50;

// Marge intégrée au prix affiché (commission unifiée à 3 %).
export const FEDAPAY_MARGIN = 0.03;

// Gross-up : prix affiché au client = prix_net / (1 − marge). DIVISION (pas
// addition) : la commission FedaPay porte sur le nouveau prix plus élevé.
export function grossUpFedaPay(netFcfa: number): number {
  return Math.round(netFcfa / (1 - FEDAPAY_MARGIN));
}

// Montant total tout compris payé par le client : (billets + livraison) gross-up.
// Billet gratuit (0 F) : aucune livraison ni frais — le client ne paie rien.
export function clientTotal(order: { amount: number; deliveryFee?: number | null }): number {
  if (order.amount <= 0) return 0;
  return grossUpFedaPay(order.amount + (order.deliveryFee || DELIVERY_FEE));
}
