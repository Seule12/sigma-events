import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, OrderStatus, PayoutStatus } from "@/app/generated/prisma/enums";
import Sidebar from "@/components/sidebar";
import { formatFcfa, displayPhone } from "@/lib/format";
import { expireStalePendingOrders } from "@/lib/shop";
import { organizerAvailableBalance, expireStalePendingPayouts, payoutAdminThreshold, PAYOUT_STATUS_META, payoutNetworkLabel } from "@/lib/payouts";
import { MOMO_NETWORKS } from "@/lib/momo";
import { requestPayoutAction, confirmPayoutOtpAction } from "@/app/actions";

export const metadata = {
  title: "Transactions — Sigma Events",
};

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  PAID: { label: "Payée", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
  PENDING: { label: "En attente", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  CANCELLED: { label: "Annulée", cls: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300" },
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ payoutOk?: string; payoutErr?: string; payoutOtp?: string; payoutId?: string; payoutOtpErr?: string }>;
}) {
  const { payoutOk, payoutErr, payoutOtp, payoutId, payoutOtpErr } = await searchParams;
  const user = await requireUser(Role.ORGANIZER);

  const events = await prisma.event.findMany({
    where: { organizerId: user.id },
    orderBy: { date: "desc" },
  });
  const sidebarEvents = events.map((e) => ({ id: e.id, name: e.name }));

  // Libère les places des commandes abandonnées avant l'affichage.
  await expireStalePendingOrders();

  const orders = await prisma.order.findMany({
    where: { event: { organizerId: user.id } },
    include: { event: true, category: true },
    orderBy: { createdAt: "desc" },
  });

  const paid = orders.filter((o) => o.status === OrderStatus.PAID);
  const gross = paid.reduce((s, o) => s + o.amount, 0);
  const commission = Math.round((gross * user.commissionRate) / 100);
  // L'organisateur reçoit prix billet − commission ; les frais de service restent
  // chez SIGMA (non détaillés ici).
  const net = gross - commission;
  const pending = orders.filter((o) => o.status === OrderStatus.PENDING);
  const cancelled = orders.filter((o) => o.status === OrderStatus.CANCELLED);

  // Retraits : purge des demandes PENDING expirées, solde disponible + historique.
  await expireStalePendingPayouts(user.id);
  const [availableBalance, payouts] = await Promise.all([
    organizerAvailableBalance(user.id),
    prisma.payout.findMany({
      where: { organizerId: user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  // Demande en cours de confirmation OTP (le code vient d'être envoyé).
  const otpPayout =
    payoutOtp === "1" && payoutId
      ? await prisma.payout.findFirst({
          where: { id: payoutId, organizerId: user.id, status: PayoutStatus.PENDING },
        })
      : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar events={sidebarEvents} userName={user.name} />

      <div className="lg:pl-[var(--sidebar-w)]">
        <main className="mx-auto max-w-6xl px-4 py-8 pt-20 sm:px-6 lg:pt-8">
          {/* En-tête */}
          <div className="mb-8">
            <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
              </span>
              Finances
            </p>
            <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
              Transactions
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              Toutes vos commandes, le solde généré et la répartition après commission Sigma.
            </p>
          </div>

          {/* Solde généré + chaîne de valeur (maquette écran 23) */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div
              className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
              style={{ borderTop: "3px solid #00e676" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Solde généré</p>
                  <p className="mt-2 font-display text-3xl font-extrabold text-brand-600 dark:text-brand-400">{formatFcfa(gross)}</p>
                  <p className="mt-1 text-xs text-slate-400">{paid.length} paiement{paid.length > 1 ? "s" : ""} validé{paid.length > 1 ? "s" : ""}</p>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 transition-transform duration-200 group-hover:scale-110 dark:text-emerald-400">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M6 15h4" /></svg>
                </span>
              </div>
            </div>

            <div
              className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
              style={{ borderTop: "3px solid #f59e0b" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Commission Sigma ({user.commissionRate} %)</p>
                  <p className="mt-2 font-display text-3xl font-extrabold text-slate-900 dark:text-white">{formatFcfa(commission)}</p>
                  <p className="mt-1 text-xs text-slate-400">Prélevée sur vos ventes payées</p>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600 transition-transform duration-200 group-hover:scale-110 dark:text-amber-400">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                </span>
              </div>
            </div>

            <div
              className="group relative overflow-hidden rounded-3xl border border-brand-200 bg-brand-50/60 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-brand-900 dark:bg-brand-950/40"
              style={{ borderTop: "3px solid #0d9488" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand-700 dark:text-brand-400">Montant reversé</p>
                  <p className="mt-2 font-display text-3xl font-extrabold text-brand-700 dark:text-brand-300">{formatFcfa(net)}</p>
                  <p className="mt-1 text-xs text-brand-600/70 dark:text-brand-500">Brut − commission Sigma</p>
                </div>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-700 transition-transform duration-200 group-hover:scale-110 dark:text-brand-300">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /></svg>
                </span>
              </div>
            </div>
          </div>

          {/* Compteurs par statut */}
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                label: "Payées",
                value: paid.length,
                color: "#00e676",
                icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>,
              },
              {
                label: "En attente",
                value: pending.length,
                color: "#f59e0b",
                icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>,
              },
              {
                label: "Annulées",
                value: cancelled.length,
                color: "#ef4444",
                icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>,
              },
            ].map((s) => (
              <div
                key={s.label}
                className="group flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
                style={{ borderTop: `3px solid ${s.color}` }}
              >
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{s.label}</p>
                  <p className="mt-1.5 font-display text-3xl font-extrabold" style={{ color: s.color }}>{s.value}</p>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-110" style={{ backgroundColor: `${s.color}1a`, color: s.color }}>
                  {s.icon}
                </span>
              </div>
            ))}
          </div>

          {/* ===== Retraits de fonds ===== */}
          <div className="mb-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                  <svg className="h-5 w-5 text-brand-600 dark:text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><path d="M12 19v3" /></svg>
                  Retirer mes fonds
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Virement de votre solde vers un compte mobile money — confirmé par un code de validation (SMS + email).
                  {" "}Les retraits au-dessus de {formatFcfa(payoutAdminThreshold())} nécessitent la validation de l&apos;équipe Sigma.
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                Disponible : {formatFcfa(availableBalance)}
              </span>
            </div>

            {payoutOk === "1" && (
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                Retrait confirmé : le virement vers votre mobile money a été lancé.
              </div>
            )}
            {payoutOk === "admin" && (
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                Code validé. Cette demande nécessite la validation de l&apos;équipe Sigma (montant élevé ou virement en attente) — vous serez notifié dès son traitement.
              </div>
            )}
            {payoutErr && (
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
                {payoutErr === "3"
                  ? "Le montant demandé dépasse votre solde disponible."
                  : payoutErr === "2"
                    ? "Trop de demandes en attente. Attendez qu&apos;une demande soit traitée."
                    : "Demande invalide. Vérifiez le montant, le réseau et le numéro."}
              </div>
            )}
            {payoutOtpErr && (
              <div className="mb-4 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                {payoutOtpErr === "rate_limited"
                  ? "Trop de tentatives. Réessayez dans quelques minutes."
                  : "Code invalide ou expiré. Vérifiez le code reçu par SMS / email."}
              </div>
            )}

            {otpPayout && (
              <div className="mb-6 rounded-3xl border-2 border-brand-300 bg-brand-50/60 p-6 shadow-sm dark:border-brand-700 dark:bg-brand-950/30">
                <div className="mb-4 flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/15 text-brand-700 dark:text-brand-300">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                  </span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Confirmez votre retrait de {formatFcfa(otpPayout.amount)}
                    </h3>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Un code à 6 chiffres vous a été envoyé par SMS et email (valable 10 minutes).
                      Saisissez-le pour confirmer le virement vers {payoutNetworkLabel(otpPayout.network)} {otpPayout.phone}.
                    </p>
                  </div>
                </div>
                <form action={confirmPayoutOtpAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="payoutId" value={otpPayout.id} />
                  <div className="min-w-0 flex-1">
                    <label htmlFor="payout-otp" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">
                      Code de validation
                    </label>
                    <input
                      id="payout-otp"
                      name="otp"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      required
                      placeholder="6 chiffres"
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-lg font-bold tracking-[0.3em] text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5"
                  >
                    Confirmer le retrait
                  </button>
                </form>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* Formulaire de retrait */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <form action={requestPayoutAction} className="space-y-4">
                  <div>
                    <label htmlFor="payout-amount" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">
                      Montant (FCFA)
                    </label>
                    <input
                      id="payout-amount"
                      name="amount"
                      type="number"
                      min="100"
                      max={availableBalance}
                      step="100"
                      required
                      placeholder={String(Math.max(0, availableBalance))}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="payout-network" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">
                      Réseau mobile money
                    </label>
                    <select
                      id="payout-network"
                      name="network"
                      required
                      defaultValue="MTN_MOMO"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      {MOMO_NETWORKS.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.name} ({n.ussd})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="payout-phone" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-400">
                      Numéro de destination
                    </label>
                    <input
                      id="payout-phone"
                      name="phone"
                      type="tel"
                      required
                      defaultValue={user.phone ? displayPhone(user.phone) : ""}
                      placeholder="+229 97 00 00 00"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={availableBalance <= 0}
                    className="w-full rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Demander le retrait (code par SMS et email)
                  </button>
                  {availableBalance <= 0 && (
                    <p className="text-center text-xs text-slate-400">
                      Aucun solde disponible pour le moment.
                    </p>
                  )}
                </form>
              </div>

              {/* Historique des retraits */}
              <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <h3 className="mb-4 text-sm font-bold text-slate-900 dark:text-white">Historique des retraits</h3>
                {payouts.length === 0 ? (
                  <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-400 dark:bg-slate-800/60">
                    Aucune demande pour le moment. Votre solde est reversé après validation.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {payouts.map((p) => {
                      const meta = PAYOUT_STATUS_META[p.status] ?? PAYOUT_STATUS_META.PENDING;
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 px-3 py-2.5 dark:border-slate-800"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-white">{formatFcfa(p.amount)}</p>
                            <p className="truncate text-xs text-slate-400">
                              {payoutNetworkLabel(p.network)} · {p.phone} ·{" "}
                              {p.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                            </p>
                            {p.adminNote && (
                              <p className="mt-0.5 truncate text-[11px] italic text-slate-400">{p.adminNote}</p>
                            )}
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Liste des transactions */}
          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
                </span>
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">Journal</p>
                  <h2 className="mt-0.5 font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">Toutes les transactions</h2>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                {orders.length}
              </span>
            </div>
            {orders.length === 0 ? (
              <p className="p-10 text-center text-slate-500 dark:text-slate-400">
                Aucune transaction pour le moment. Partagez vos liens de boutique pour commencer à vendre.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="py-3 pl-6 pr-4">Référence</th>
                      <th className="py-3 pr-4">Événement</th>
                      <th className="py-3 pr-4">Client</th>
                      <th className="py-3 pr-4">Billet</th>
                      <th className="py-3 pr-4">Date</th>
                      <th className="py-3 pr-4">Statut</th>
                      <th className="py-3 pr-6 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {orders.map((o) => {
                      const st = STATUS_LABEL[o.status] ?? STATUS_LABEL.PENDING;
                      return (
                        <tr key={o.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-3 pl-6 pr-4 font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{o.reference}</td>
                          <td className="max-w-[180px] truncate py-3 pr-4 font-semibold text-slate-800 dark:text-slate-200">
                            <Link href={`/events/${o.eventId}`} className="hover:text-brand-600 dark:hover:text-brand-400">
                              {o.event.name}
                            </Link>
                          </td>
                          <td className="max-w-[160px] truncate py-3 pr-4 text-slate-600 dark:text-slate-300">
                            {o.customerName}
                            <span className="block text-[11px] text-slate-400">{displayPhone(o.customerPhone)}</span>
                          </td>
                          <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">
                            {o.category?.name ?? "Standard"} × {o.quantity}
                          </td>
                          <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">
                            {o.paidAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) ??
                              o.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="py-3 pr-4">
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${st.cls}`}>{st.label}</span>
                          </td>
                          <td className="py-3 pr-6 text-right font-bold text-slate-900 dark:text-white">
                            {formatFcfa(o.amount)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
