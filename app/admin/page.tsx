import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, OrderStatus, CheckInStatus } from "@/app/generated/prisma/enums";
import AdminNav from "@/components/admin-nav";
import { formatFcfa } from "@/lib/format";
import { expireStalePendingOrders } from "@/lib/shop";

export const metadata = {
  title: "Admin — Sigma Security",
};

export default async function AdminDashboardPage() {
  const admin = await requireUser(Role.SUPER_ADMIN);
  await expireStalePendingOrders();

  const [organizerCount, agentCount, eventCount, ticketCount, enteredCount, pendingCount, paidOrders] =
    await Promise.all([
      prisma.user.count({ where: { role: Role.ORGANIZER } }),
      prisma.user.count({ where: { role: Role.AGENT } }),
      prisma.event.count(),
      prisma.ticket.count(),
      prisma.checkIn.count({ where: { status: { in: [CheckInStatus.VALID, CheckInStatus.ENTRY] } } }),
      prisma.order.count({ where: { status: OrderStatus.PENDING } }),
      prisma.order.findMany({
        where: { status: OrderStatus.PAID },
        include: { event: { include: { organizer: true } }, category: true },
        orderBy: { paidAt: "desc" },
      }),
    ]);

  const totalRevenue = paidOrders.reduce((s, o) => s + o.amount, 0);
  const totalDeliveryFees = paidOrders.reduce((s, o) => s + (o.deliveryFee || 0), 0);

  // Commission Sigma par organisateur (taux individuel × CA) — tous les organisateurs,
  // y compris bloqués : leur CA historique reste compté dans les totaux de la plateforme.
  const organizers = await prisma.user.findMany({
    where: { role: Role.ORGANIZER },
    include: { organizedEvents: { include: { orders: { where: { status: OrderStatus.PAID }, select: { amount: true } } } } },
  });
  const commissionByOrganizer = new Map<string, { name: string; revenue: number; commission: number; rate: number }>();
  let totalCommission = 0;
  for (const org of organizers) {
    const revenue = org.organizedEvents.reduce((s, e) => s + e.orders.reduce((x, o) => x + o.amount, 0), 0);
    const commission = Math.round((revenue * org.commissionRate) / 100);
    commissionByOrganizer.set(org.id, { name: org.name, revenue, commission, rate: org.commissionRate });
    totalCommission += commission;
  }

  // CA des 14 derniers jours (toutes plateformes)
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <AdminNav active="/admin" />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Vue d&apos;ensemble de la plateforme
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Bienvenue, {admin.name.split(" ")[0]} — tous les chiffres de Sigma Security.
          </p>
        </div>

        {/* Chiffres clés */}
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-extrabold text-brand-600 dark:text-brand-400">{formatFcfa(totalRevenue + totalDeliveryFees)}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Volume global (billets + livraison)</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-extrabold text-sky-600 dark:text-sky-400">{formatFcfa(totalDeliveryFees)}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Frais de livraison</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">{formatFcfa(totalCommission)}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Commissions Sigma</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white">
              {organizerCount}
              <span className="ml-1 text-sm font-bold text-slate-400">· {agentCount}</span>
            </p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Organisateurs · Agents</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{eventCount}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Événements</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{ticketCount}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Billets émis</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-extrabold text-brand-600 dark:text-brand-400">{enteredCount}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Entrées validées</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-2xl font-extrabold text-amber-500">{pendingCount}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Paiements en attente</p>
          </div>
          <Link
            href="/admin/organisateurs"
            className="group flex flex-col justify-center rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/50 p-5 transition hover:-translate-y-0.5 hover:border-brand-400 hover:bg-brand-50 dark:border-brand-800 dark:bg-brand-950/20 dark:hover:border-brand-700"
          >
            <p className="text-sm font-bold text-brand-700 group-hover:underline dark:text-brand-300">
              Gérer les organisateurs →
            </p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Bloquer un compte, ajuster une commission</p>
          </Link>
        </div>

        {/* Graphique 14 jours */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 dark:text-white">Chiffre d&apos;affaires — 14 derniers jours</h2>
            <span className="text-xs font-semibold text-slate-400">toutes plateformes confondues</span>
          </div>
          {totalRevenue === 0 ? (
            <p className="text-sm text-slate-400">Aucune vente sur cette période.</p>
          ) : (
            <div className="flex h-36 items-end gap-1.5">
              {days.map((d, i) => (
                <div key={i} className="group relative flex h-full flex-1 flex-col justify-end">
                  <div
                    role="img"
                    aria-label={`${d.label} : ${formatFcfa(d.revenue)}`}
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

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Commissions par organisateur */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 font-bold text-slate-900 dark:text-white">Commissions par organisateur</h2>
            {commissionByOrganizer.size === 0 ? (
              <p className="text-sm text-slate-400">Aucun organisateur actif.</p>
            ) : (
              <div className="space-y-3">
                {Array.from(commissionByOrganizer.values()).map((o) => (
                  <div key={o.name}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="truncate font-semibold text-slate-700 dark:text-slate-200">{o.name}</span>
                      <span className="shrink-0 font-bold text-slate-900 dark:text-white">
                        {formatFcfa(o.commission)}
                        <span className="ml-2 text-xs font-semibold text-slate-400">{o.rate} %</span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        role="img"
                        aria-label={`Commission ${o.name} : ${formatFcfa(o.commission)}`}
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600"
                        style={{ width: `${Math.min(100, Math.round((o.commission / Math.max(1, totalCommission)) * 100))}%` }}
                      />
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-400">CA : {formatFcfa(o.revenue)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ventes récentes */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 font-bold text-slate-900 dark:text-white">Ventes récentes</h2>
            {paidOrders.length === 0 ? (
              <p className="text-sm text-slate-400">Aucune vente pour le moment.</p>
            ) : (
              <div className="space-y-2.5">
                {paidOrders.slice(0, 8).map((o) => (
                  <div key={o.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5 dark:border-slate-800">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{o.event.name}</p>
                      <p className="truncate text-xs text-slate-400">
                        {o.customerName} · {o.event.organizer.name}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{formatFcfa(o.amount)}</p>
                      <p className="text-[10px] text-slate-400">
                        {o.paidAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
