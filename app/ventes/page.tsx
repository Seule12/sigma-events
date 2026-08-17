import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, OrderStatus } from "@/app/generated/prisma/enums";
import Sidebar from "@/components/sidebar";
import { formatFcfa } from "@/lib/format";
import { expireStalePendingOrders } from "@/lib/shop";

export const metadata = {
  title: "Mes Ventes — Sigma Events",
};

export default async function SalesPage() {
  const user = await requireUser(Role.ORGANIZER);

  const events = await prisma.event.findMany({
    where: { organizerId: user.id },
    include: {
      categories: true,
      _count: { select: { tickets: true } },
    },
    orderBy: { date: "desc" },
  });
  const sidebarEvents = events.map((e) => ({ id: e.id, name: e.name }));

  const paidOrders = await prisma.order.findMany({
    where: { event: { organizerId: user.id }, status: OrderStatus.PAID },
    include: { event: true, category: true },
    orderBy: { paidAt: "desc" },
  });

  const totalRevenue = paidOrders.reduce((s, o) => s + o.amount, 0);
  const commissionAmount = Math.round((totalRevenue * user.commissionRate) / 100);
  // L'organisateur reçoit prix billet − commission ; les frais de service restent
  // chez SIGMA (non détaillés ici).
  const netRevenue = totalRevenue - commissionAmount;
  const totalTicketsSold = paidOrders.length;

  await expireStalePendingOrders();
  const pendingCount = await prisma.order.count({
    where: { event: { organizerId: user.id }, status: OrderStatus.PENDING },
  });

  const days: { label: string; revenue: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - i);
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    const revenue = paidOrders
      .filter((o) => o.paidAt && o.paidAt >= day && o.paidAt < next)
      .reduce((s, o) => s + o.amount, 0);
    days.push({ label: day.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }), revenue });
  }
  const maxDayRevenue = Math.max(1, ...days.map((d) => d.revenue));

  const byEvent = new Map<string, { name: string; id: string; revenue: number; count: number }>();
  for (const o of paidOrders) {
    const e = byEvent.get(o.event.id) ?? { name: o.event.name, id: o.event.id, revenue: 0, count: 0 };
    e.revenue += o.amount;
    e.count += 1;
    byEvent.set(o.event.id, e);
  }

  const byCategory = new Map<string, { name: string; revenue: number; count: number }>();
  for (const o of paidOrders) {
    const key = o.category?.name ?? "Standard";
    const c = byCategory.get(key) ?? { name: key, revenue: 0, count: 0 };
    c.revenue += o.amount;
    c.count += 1;
    byCategory.set(key, c);
  }

  const maxEventRevenue = Math.max(1, ...Array.from(byEvent.values()).map((e) => e.revenue));
  const maxCatRevenue = Math.max(1, ...Array.from(byCategory.values()).map((c) => c.revenue));
  const totalIssued = events.reduce((s, e) => s + e._count.tickets, 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar events={sidebarEvents} userName={user.name} />

      <div className="lg:pl-[var(--sidebar-w)]">
        <main className="mx-auto max-w-6xl px-4 py-8 pt-20 sm:px-6 lg:pt-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Suivi des Ventes
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Analyse financière et performance de vos billetteries.
              </p>
            </div>
            <Link
              href="/profil"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Mon Profil
            </Link>
          </div>

          {/* KPI-S modernisés */}
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
            <div className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 dark:border-slate-800 dark:bg-slate-900">
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-brand-500/10 blur-2xl" />
              <p className="text-2xl font-extrabold text-brand-600 dark:text-brand-400">{formatFcfa(totalRevenue)}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">CA Total Billets</p>
            </div>
            <div className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 dark:border-slate-800 dark:bg-slate-900">
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl" />
              <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{formatFcfa(netRevenue)}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Net Reversé</p>
            </div>
            <div className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 dark:border-slate-800 dark:bg-slate-900">
              <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-slate-500/10 blur-2xl" />
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{totalTicketsSold}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Billets Vendus</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{totalIssued}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Billets Émis</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{pendingCount}</p>
              <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">En attente</p>
            </div>
          </div>

          {/* Évolution du CA */}
          <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 dark:text-white">Évolution du CA (14 jours)</h2>
              <span className="text-xs font-semibold text-slate-400">Activités récentes</span>
            </div>
            {totalRevenue === 0 ? (
              <p className="text-sm text-slate-400">Aucune vente sur cette période.</p>
            ) : (
              <div className="flex h-36 items-end gap-1.5">
                {days.map((d, i) => (
                  <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
                    <div
                      className={`w-full rounded-t-md transition-all duration-500 ${
                        d.revenue > 0 ? "bg-gradient-to-t from-brand-600 to-brand-400" : "bg-slate-100 dark:bg-slate-800"
                      }`}
                      style={{ height: `${Math.max(d.revenue > 0 ? 6 : 2, Math.round((d.revenue / maxDayRevenue) * 100))}%` }}
                    />
                    <span className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2 py-1 text-[10px] font-bold text-white opacity-0 shadow-lg transition group-hover:opacity-100">
                      {formatFcfa(d.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex justify-between text-[10px] font-semibold text-slate-400">
              <span>{days[0]?.label}</span>
              <span>{days[6]?.label}</span>
              <span>{days[13]?.label}</span>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 font-bold text-slate-900 dark:text-white">Revenus par Événement</h2>
              {byEvent.size === 0 ? (
                <p className="text-sm text-slate-400">Aucune vente.</p>
              ) : (
                <div className="space-y-3">
                  {Array.from(byEvent.values()).map((e) => (
                    <div key={e.id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <Link href={`/events/${e.id}`} className="truncate font-semibold text-slate-700 hover:text-brand-600 dark:text-slate-200 dark:hover:text-brand-400">
                          {e.name}
                        </Link>
                        <span className="shrink-0 font-bold text-slate-900 dark:text-white">
                          {formatFcfa(e.revenue)}
                          <span className="ml-2 text-xs font-semibold text-slate-400">{e.count} bts</span>
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-700"
                          style={{ width: `${Math.round((e.revenue / maxEventRevenue) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 font-bold text-slate-900 dark:text-white">Revenus par Catégorie</h2>
              {byCategory.size === 0 ? (
                <p className="text-sm text-slate-400">Aucune vente.</p>
              ) : (
                <div className="space-y-3">
                  {Array.from(byCategory.values()).map((c) => (
                    <div key={c.name}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="font-semibold text-slate-700 dark:text-slate-200">{c.name}</span>
                        <span className="font-bold text-slate-900 dark:text-white">
                          {formatFcfa(c.revenue)}
                          <span className="ml-2 text-xs font-semibold text-slate-400">{c.count} bts</span>
                        </span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-600"
                          style={{ width: `${Math.round((c.revenue / maxCatRevenue) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-slate-800">
              <h2 className="font-bold text-slate-900 dark:text-white">Transactions Récentes</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                {paidOrders.length}
              </span>
            </div>
            {paidOrders.length === 0 ? (
              <p className="p-10 text-center text-slate-500 dark:text-slate-400">
                Aucune vente enregistrée.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50/50 text-xs font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800 dark:bg-slate-900/50">
                    <tr>
                      <th className="py-3 pl-6 pr-4">Référence</th>
                      <th className="py-3 pr-4">Événement</th>
                      <th className="py-3 pr-4">Client</th>
                      <th className="py-3 pr-4">Billet</th>
                      <th className="py-3 pr-4">Date</th>
                      <th className="py-3 pr-6 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {paidOrders.slice(0, 20).map((o) => (
                      <tr key={o.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-3 pl-6 pr-4 font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{o.reference}</td>
                        <td className="max-w-[180px] truncate py-3 pr-4 font-semibold text-slate-800 dark:text-slate-200">{o.event.name}</td>
                        <td className="max-w-[160px] truncate py-3 pr-4 text-slate-600 dark:text-slate-300">{o.customerName}</td>
                        <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">{o.category?.name ?? "Standard"}</td>
                        <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">
                          {o.paidAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-3 pr-6 text-right font-bold text-slate-900 dark:text-white">{formatFcfa(o.amount)}</td>
                      </tr>
                    ))}
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
