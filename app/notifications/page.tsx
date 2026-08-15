import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, OrderStatus } from "@/app/generated/prisma/enums";
import Sidebar from "@/components/sidebar";
import { formatFcfa } from "@/lib/format";
import { expireStalePendingOrders } from "@/lib/shop";

export const metadata = {
  title: "Notifications — Sigma Security",
};

export default async function NotificationsPage() {
  const user = await requireUser(Role.ORGANIZER);

  const events = await prisma.event.findMany({
    where: { organizerId: user.id },
    orderBy: { date: "desc" },
  });
  const sidebarEvents = events.map((e) => ({ id: e.id, name: e.name }));

  // Alertes de jauge (80 / 90 / 100 %) déclenchées sur mes événements.
  const alerts = await prisma.capacityAlert.findMany({
    where: { event: { organizerId: user.id } },
    include: { event: true },
    orderBy: { triggeredAt: "desc" },
  });

  // Paiements reçus (7 derniers jours).
  await expireStalePendingOrders();
  const since = new Date(new Date().getTime() - 7 * 24 * 3600_000);
  const paid = await prisma.order.findMany({
    where: { event: { organizerId: user.id }, status: OrderStatus.PAID, paidAt: { gte: since } },
    include: { event: true },
    orderBy: { paidAt: "desc" },
    take: 30,
  });

  // Billets / invitations générés récemment (24 h).
  const ticketsSince = new Date(new Date().getTime() - 24 * 3600_000);
  const recentTickets = await prisma.ticket.count({
    where: { event: { organizerId: user.id }, createdAt: { gte: ticketsSince } },
  });

  const totalAlerts = alerts.length;
  const totalPaid = paid.length;

  // Flux de notifications trié par date (alerte jauge + paiements).
  type Item = { key: string; at: Date; kind: "gauge" | "payment"; title: string; desc: string; href: string };
  const items: Item[] = [
    ...alerts.map((a) => ({
      key: `gauge-${a.id}`,
      at: a.triggeredAt,
      kind: "gauge" as const,
      title: `${a.event.name} a atteint ${a.threshold} % de sa capacité`,
      desc: "La jauge approche (ou atteint) la saturation. Vérifiez les entrées et la billetterie.",
      href: `/events/${a.eventId}`,
    })),
    ...paid.map((o) => ({
      key: `pay-${o.id}`,
      at: o.paidAt ?? o.createdAt,
      kind: "payment" as const,
      title: `Paiement reçu : ${formatFcfa(o.amount + (o.deliveryFee || 0))}`,
      desc: `${o.event.name} — ${o.customerName} · ${o.reference}${o.deliveryFee ? ` (dont livraison ${formatFcfa(o.deliveryFee)})` : ""}`,
      href: `/transactions`,
    })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 40) as Item[];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar events={sidebarEvents} userName={user.name} isPro={user.profileType === "PRO"} />

      <div className="lg:pl-[var(--sidebar-w)]">
        <main className="mx-auto max-w-3xl px-4 py-8 pt-20 sm:px-6 lg:pt-8">
          {/* En-tête */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Notifications</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Alertes de jauge, paiements reçus et activité de vos événements.
              </p>
            </div>
            <div className="flex gap-2">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                {totalAlerts} alerte{totalAlerts > 1 ? "s" : ""} jauge
              </span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                {totalPaid} paiement{totalPaid > 1 ? "s" : ""} (7 j)
              </span>
            </div>
          </div>

          {/* Flux de notifications */}
          {items.length === 0 && recentTickets === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-400 dark:border-slate-700">
              Aucune notification pour le moment. Les alertes de jauge (80 / 90 / 100 %), les paiements reçus
              et l&apos;activité de vos événements apparaîtront ici.
            </div>
          ) : (
            <ul className="space-y-3">
              {items.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-700"
                  >
                    <span
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                        item.kind === "gauge"
                          ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                          : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                      }`}
                    >
                      {item.kind === "gauge" ? (
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
                      ) : (
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-400">
                        {item.at.toLocaleDateString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <svg className="h-4 w-4 shrink-0 self-center text-slate-300 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                  </Link>
                </li>
              ))}

              {/* Activité récente : billets générés */}
              {recentTickets > 0 && (
                <li>
                  <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M13 5v2M13 17v2M13 11v2" /></svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        {recentTickets} billet{recentTickets > 1 ? "s" : ""} généré{recentTickets > 1 ? "s" : ""} ces dernières 24 h
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Billets QR émis (ventes en ligne + invitations importées).
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-400">Dernières 24 heures</p>
                    </div>
                  </div>
                </li>
              )}

              {/* Rapports disponibles */}
              {events.length > 0 && (
                <li>
                  <div className="flex items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18 17V9M13 17V5M8 17v-3" /></svg>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">
                        Rapport d&apos;accès disponible
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Exportez le rapport PDF ou CSV du journal des entrées de vos événements.
                      </p>
                      <p className="mt-1 text-[11px] font-semibold text-slate-400">Toujours disponible</p>
                    </div>
                    <Link
                      href={`/events/${events[0].id}/rapport`}
                      className="shrink-0 self-center rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-3 py-2 text-xs font-bold text-white shadow transition hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      Ouvrir
                    </Link>
                  </div>
                </li>
              )}
            </ul>
          )}
        </main>
      </div>
    </div>
  );
}
