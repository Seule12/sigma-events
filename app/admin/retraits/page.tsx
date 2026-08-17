import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, PayoutStatus } from "@/app/generated/prisma/enums";
import AdminNav from "@/components/admin-nav";
import { formatFcfa, displayPhone } from "@/lib/format";
import { PAYOUT_STATUS_META, payoutNetworkLabel } from "@/lib/payouts";
import { isFedaPayPayoutEnabled } from "@/lib/fedapay";
import { processPayoutAction, refreshPayoutStatusAction } from "@/app/actions";

export const metadata = {
  title: "Retraits — Admin Sigma",
};

export default async function AdminPayoutsPage({
  searchParams,
}: {
  searchParams: Promise<{ payoutErr?: string }>;
}) {
  const { payoutErr } = await searchParams;
  await requireUser(Role.SUPER_ADMIN);
  const fedapayEnabled = isFedaPayPayoutEnabled();

  const payouts = await prisma.payout.findMany({
    where: { status: { not: PayoutStatus.CANCELLED } },
    include: { organizer: { select: { name: true, phone: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  // Validation admin requise : OTP confirmé par l'organisateur mais montant au-
  // dessus du seuil (double sécurité) ou virement FedaPay à déclencher.
  const pendingAdmin = payouts.filter((p) => p.status === PayoutStatus.PENDING_ADMIN);
  // Code envoyé, en attente de confirmation par l'organisateur (pas actionnable).
  const awaitingOtp = payouts.filter((p) => p.status === PayoutStatus.PENDING);
  const processing = payouts.filter((p) => p.status === PayoutStatus.PROCESSING);
  const settled = payouts.filter((p) => p.status === PayoutStatus.PAID || p.status === PayoutStatus.FAILED);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <AdminNav active="/admin/retraits" />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Retraits des organisateurs
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Double validation des gros retraits : l&apos;organisateur confirme déjà son retrait par code (OTP) ;
            au-delà du seuil, validez en plus — l&apos;argent part du compte FedaPay vers le mobile money de l&apos;organisateur.
          </p>
        </div>

        {!fedapayEnabled && (
          <div className="mb-6 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
            FedaPay non configuré (FEDAPAY_SECRET_KEY manquant) : les virements sont bloqués.
          </div>
        )}
        {payoutErr && (
          <div className="mb-6 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            Virement impossible : configurez d&apos;abord la clé FedaPay (FEDAPAY_SECRET_KEY).
          </div>
        )}

        {/* Demandes en attente */}
        <div className="mb-8 rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
            <h2 className="font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
              En attente de validation
            </h2>
            <p className="text-xs text-slate-400">
              {pendingAdmin.length} demande{pendingAdmin.length > 1 ? "s" : ""}
              {awaitingOtp.length > 0
                ? ` · ${awaitingOtp.length} en attente du code organisateur`
                : ""}
            </p>
          </div>
          {pendingAdmin.length === 0 && awaitingOtp.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-400">Aucune demande en attente.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {awaitingOtp.map((p) => (
                <div key={p.id} className="flex flex-wrap items-start gap-4 px-6 py-5 opacity-60">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 dark:text-white">{formatFcfa(p.amount)}</p>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                      {p.organizer.name}
                      {p.organizer.phone ? ` · ${displayPhone(p.organizer.phone)}` : ""}
                    </p>
                    <p className="text-xs text-slate-400">
                      {payoutNetworkLabel(p.network)} → {p.phone} ·{" "}
                      {p.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    Code à confirmer par l&apos;organisateur
                  </span>
                </div>
              ))}
              {pendingAdmin.map((p) => (
                <div key={p.id} className="flex flex-wrap items-start gap-4 px-6 py-5">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 dark:text-white">{formatFcfa(p.amount)}</p>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
                      {p.organizer.name}
                      {p.organizer.phone ? ` · ${displayPhone(p.organizer.phone)}` : ""}
                    </p>
                    <p className="text-xs text-slate-400">
                      {payoutNetworkLabel(p.network)} → {p.phone} ·{" "}
                      {p.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <form action={processPayoutAction} className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                    <input type="hidden" name="payoutId" value={p.id} />
                    <input
                      name="note"
                      placeholder="Note (facultatif)"
                      className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-brand-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 sm:w-48"
                    />
                    <button
                      type="submit"
                      name="decision"
                      value="pay"
                      className="flex shrink-0 items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 transition hover:-translate-y-0.5"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" /></svg>
                      Valider et verser
                    </button>
                    <button
                      type="submit"
                      name="decision"
                      value="cancel"
                      className="shrink-0 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-500 transition hover:border-red-300 hover:text-red-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-red-900 dark:hover:text-red-400"
                    >
                      Refuser
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Virements en cours */}
        {processing.length > 0 && (
          <div className="mb-8 rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
              <h2 className="font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                Virements en cours
              </h2>
              <p className="text-xs text-slate-400">Interrogez FedaPay pour connaître le statut final.</p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {processing.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900 dark:text-white">{formatFcfa(p.amount)}</p>
                    <p className="text-xs text-slate-400">
                      {p.organizer.name} · {payoutNetworkLabel(p.network)} → {p.phone} · FedaPay #{p.fedapayId}
                    </p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${PAYOUT_STATUS_META[p.status].cls}`}>
                    {PAYOUT_STATUS_META[p.status].label}
                  </span>
                  <form action={refreshPayoutStatusAction.bind(null, p.id)}>
                    <button
                      type="submit"
                      className="rounded-xl border border-sky-200 px-4 py-2 text-xs font-bold text-sky-600 transition hover:border-sky-400 hover:text-sky-700 dark:border-sky-900 dark:text-sky-400"
                    >
                      Actualiser le statut
                    </button>
                  </form>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Historique */}
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-6 py-5 dark:border-slate-800">
            <h2 className="font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
              Historique
            </h2>
            <p className="text-xs text-slate-400">Virements versés et échecs récents.</p>
          </div>
          {settled.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-400">Aucun virement traité.</p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {settled.slice(0, 20).map((p) => {
                const meta = PAYOUT_STATUS_META[p.status];
                return (
                  <div key={p.id} className="flex items-center gap-4 px-6 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-slate-900 dark:text-white">{formatFcfa(p.amount)}</p>
                      <p className="truncate text-xs text-slate-400">
                        {p.organizer.name} · {payoutNetworkLabel(p.network)} → {p.phone} ·{" "}
                        {p.processedAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) ??
                          p.createdAt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                        {p.fedapayId ? ` · FedaPay #${p.fedapayId}` : ""}
                      </p>
                      {p.adminNote && <p className="mt-0.5 truncate text-[11px] italic text-slate-400">{p.adminNote}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${meta.cls}`}>{meta.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
