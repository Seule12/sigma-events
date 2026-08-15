// Retraits organisateurs — logique partagée (calcul du solde disponible, statuts,
// seuil de double validation admin).
import { prisma } from "@/lib/prisma";
import { OrderStatus, PayoutStatus } from "@/app/generated/prisma/enums";

// Durée de vie d'un OTP de retrait (10 min, cohérent avec les autres OTP du
// système) : au-delà, la demande PENDING non confirmée est annulée.
export const PAYOUT_OTP_TTL_MS = 10 * 60_000;

// Seuil au-delà duquel un retrait confirmé par OTP nécessite EN PLUS la
// validation d'un super admin (double sécurité pour les gros montants).
// Configurable via PAYOUT_ADMIN_THRESHOLD (FCFA) — défaut 100 000 FCFA.
export function payoutAdminThreshold(): number {
  const raw = Number(process.env.PAYOUT_ADMIN_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 100_000;
}

// Annule les demandes de retrait PENDING dont l'OTP n'a pas été confirmé à temps
// (l'organisateur a abandonné la saisie du code). Appelé avant chaque calcul de
// solde / nouvelle demande pour ne pas bloquer le solde indéfiniment.
export async function expireStalePendingPayouts(organizerId: string): Promise<void> {
  const cutoff = new Date(Date.now() - PAYOUT_OTP_TTL_MS);
  await prisma.payout.updateMany({
    where: { organizerId, status: PayoutStatus.PENDING, createdAt: { lt: cutoff } },
    data: { status: PayoutStatus.CANCELLED, adminNote: "Demande expirée : code de validation non confirmé à temps." },
  });
}

// Solde disponible pour retrait : (ventes payées − commission Sigma) moins les
// demandes déjà en cours (PENDING / PENDING_ADMIN / PROCESSING). Même calcul que
// la carte « Montant reversé » de /transactions.
//
// Modèle FedaPay (brief) : l'organisateur reçoit prix billet − commission ; les
// frais de livraison (50 F) restent chez SIGMA (avec la marge FedaPay).
export async function organizerAvailableBalance(organizerId: string): Promise<number> {
  const [orders, pending] = await Promise.all([
    prisma.order.findMany({
      where: { event: { organizerId }, status: OrderStatus.PAID },
      select: { amount: true },
    }),
    prisma.payout.aggregate({
      where: {
        organizerId,
        status: { in: [PayoutStatus.PENDING, PayoutStatus.PENDING_ADMIN, PayoutStatus.PROCESSING] },
      },
      _sum: { amount: true },
    }),
  ]);

  const gross = orders.reduce((s, o) => s + o.amount, 0);
  const user = await prisma.user.findUnique({
    where: { id: organizerId },
    select: { commissionRate: true },
  });
  const commission = Math.round((gross * (user?.commissionRate ?? 3)) / 100);
  const net = gross - commission;

  return Math.max(0, net - (pending._sum.amount ?? 0));
}

export const PAYOUT_STATUS_META: Record<PayoutStatus, { label: string; cls: string }> = {
  PENDING: { label: "Code à confirmer", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  PENDING_ADMIN: { label: "Validation admin", cls: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  PROCESSING: { label: "En cours", cls: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" },
  PAID: { label: "Versé", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  FAILED: { label: "Échec", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  CANCELLED: { label: "Annulé", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

export const PAYOUT_NETWORK_LABEL: Record<string, string> = {
  MTN_MOMO: "MTN MoMo",
  MOOV_MONEY: "Moov Money",
  CELTIIS: "Celtiis Cash",
};

export function payoutNetworkLabel(network?: string | null): string {
  return (network && PAYOUT_NETWORK_LABEL[network]) || "Mobile money";
}
