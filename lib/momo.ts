// Réseaux de mobile money acceptés (Bénin) — module partagé serveur/client.

export type MomoNetwork = {
  id: string; // stocké dans Order.paymentMethod (suffixe _DEMO pour les paiements simulés)
  name: string; // MTN Mobile Money
  short: string; // MTN
  ussd: string; // *126#
  dot: string; // classe du pastille couleur
  badge: string; // classe du badge
  hint: string; // phrase d'aide
};

export const MOMO_NETWORKS: MomoNetwork[] = [
  {
    id: "MTN_MOMO",
    name: "MTN Mobile Money",
    short: "MTN",
    ussd: "*880#",
    dot: "bg-yellow-400",
    badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
    hint: "Le plus utilisé au Bénin",
  },
  {
    id: "MOOV_MONEY",
    name: "Moov Money",
    short: "Moov",
    ussd: "*855#",
    dot: "bg-sky-500",
    badge: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    hint: "Réseau Moov Africa",
  },
  {
    id: "CELTIIS",
    name: "Celtiis Cash",
    short: "Celtiis",
    ussd: "*899#",
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    hint: "Le nouvel opérateur béninois",
  },
];

export function momoNetworkById(id?: string | null): MomoNetwork | undefined {
  if (!id) return undefined;
  // MOMO_DEMO (valeur par défaut historique) → MTN Mobile Money
  const key = id === "MOMO_DEMO" ? "MTN_MOMO" : id.replace(/_DEMO$/, "");
  return MOMO_NETWORKS.find((n) => n.id === key);
}

// Libellé lisible de la méthode de paiement enregistrée sur la commande.
export function paymentMethodLabel(paymentMethod?: string | null): string {
  if (paymentMethod === "FREE") return "Billet gratuit";
  const network = momoNetworkById(paymentMethod);
  if (!network) return "Mobile money";
  return network.name;
}
