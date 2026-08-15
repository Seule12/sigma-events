import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, OrderStatus } from "@/app/generated/prisma/enums";
import AdminNav from "@/components/admin-nav";
import { formatFcfa } from "@/lib/format";

export const metadata = {
  title: "Événements — Admin Sigma",
};

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300",
  LIVE: "bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300",
  DONE: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};
const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Brouillon",
  LIVE: "Annoncé",
  DONE: "Terminé",
};

export default async function AdminEventsPage() {
  await requireUser(Role.SUPER_ADMIN);

  const events = await prisma.event.findMany({
    include: {
      organizer: { select: { name: true, active: true } },
      _count: { select: { tickets: true, checkIns: { where: { status: "VALID" } } } },
      orders: { where: { status: OrderStatus.PAID }, select: { amount: true } },
    },
    orderBy: { date: "desc" },
  });

  const rows = events.map((e) => {
    const revenue = e.orders.reduce((s, o) => s + o.amount, 0);
    const gauge = e.capacity > 0 ? Math.round((e._count.checkIns / e.capacity) * 100) : 0;
    return { event: e, revenue, gauge };
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <AdminNav active="/admin/evenements" />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Événements</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {events.length} événement{events.length > 1 ? "s" : ""} sur la plateforme — vue de contrôle globale.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-10 text-center text-slate-400 dark:border-slate-800">
            Aucun événement créé pour le moment.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="py-3 pl-6 pr-4">Événement</th>
                  <th className="py-3 pr-4">Organisateur</th>
                  <th className="py-3 pr-4">Date</th>
                  <th className="py-3 pr-4">Statut</th>
                  <th className="py-3 pr-4">Jauge</th>
                  <th className="py-3 pr-4">Billets</th>
                  <th className="py-3 pr-6 text-right">Ventes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map(({ event, revenue, gauge }) => (
                  <tr key={event.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="max-w-[220px] truncate py-3 pl-6 pr-4">
                      <p className="truncate font-semibold text-slate-800 dark:text-slate-200">{event.name}</p>
                      <p className="truncate text-xs text-slate-400">{event.location}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="text-slate-600 dark:text-slate-300">{event.organizer.name}</p>
                      {!event.organizer.active && (
                        <span className="text-[10px] font-bold text-red-500">compte bloqué</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">
                      {event.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_BADGE[event.status] ?? ""}`}>
                        {STATUS_LABEL[event.status] ?? event.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full ${gauge >= 100 ? "bg-red-500" : gauge >= 80 ? "bg-amber-500" : "bg-brand-500"}`}
                            style={{ width: `${Math.min(100, gauge)}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-semibold text-slate-400">{gauge}%</span>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">
                      {event._count.tickets} / {event.capacity}
                    </td>
                    <td className="py-3 pr-6 text-right font-bold text-slate-900 dark:text-white">
                      {formatFcfa(revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
