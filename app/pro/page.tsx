import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, OrderStatus, UserProfileType } from "@/app/generated/prisma/enums";
import Sidebar from "@/components/sidebar";
import { formatFcfa } from "@/lib/format";

export const metadata = {
  title: "Espace agence — Sigma Security",
};

export default async function AgencyPage() {
  const user = await requireUser(Role.ORGANIZER);

  // Espace réservé aux comptes Professionnels de l'événementiel.
  if (user.profileType !== UserProfileType.PRO) redirect("/dashboard");

  const events = await prisma.event.findMany({
    where: { organizerId: user.id },
    include: {
      categories: true,
      _count: { select: { tickets: true, checkIns: true } },
      orders: { where: { status: OrderStatus.PAID }, select: { amount: true, deliveryFee: true } },
    },
    orderBy: { date: "desc" },
  });
  const sidebarEvents = events.map((e) => ({ id: e.id, name: e.name }));

  const totalRevenue = events.reduce((s, e) => s + e.orders.reduce((a, o) => a + o.amount, 0), 0);
  const totalDeliveryFees = events.reduce((s, e) => s + e.orders.reduce((a, o) => a + (o.deliveryFee || 0), 0), 0);
  const commissionAmount = Math.round((totalRevenue * user.commissionRate) / 100);
  const netRevenue = totalRevenue + totalDeliveryFees - commissionAmount;
  const totalTickets = events.reduce((s, e) => s + e._count.tickets, 0);
  const totalEntered = events.reduce((s, e) => s + e._count.checkIns, 0);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar events={sidebarEvents} userName={user.name} isPro />

      <div className="lg:pl-[var(--sidebar-w)]">
        <main className="mx-auto max-w-6xl px-4 py-10 pt-24 sm:px-6 lg:pt-12">
          {/* En-tête */}
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></svg>
                Espace agence — SIGMA PRO
              </p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {user.orgName || user.name}
              </h1>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                Vue d&apos;ensemble de votre activité événementielle et de vos ventes.
              </p>
            </div>
            <Link
              href="/dashboard#create-event"
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              Nouvel événement
            </Link>
          </div>

          {/* Fiche agence */}
          {(user.responsibleName || user.proPhone || user.avgEventsPerMonth || user.avgParticipants) && (
            <div className="mb-8 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-3xl border border-brand-200 bg-brand-50/60 px-6 py-5 dark:border-brand-800 dark:bg-brand-950/30">
              {user.responsibleName && (
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  </span>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Responsable</p>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white">{user.responsibleName}</p>
                  </div>
                </div>
              )}
              {user.proPhone && (
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900 dark:text-brand-300">
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                  </span>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Téléphone pro</p>
                    <p className="text-sm font-extrabold text-slate-900 dark:text-white">+229 {user.proPhone}</p>
                  </div>
                </div>
              )}
              {(user.avgEventsPerMonth || user.avgParticipants) && (
                <div className="ml-auto flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="rounded-full bg-white px-3 py-1.5 shadow-sm dark:bg-slate-900">
                    Volume : {user.avgEventsPerMonth ?? "—"} évén./mois
                  </span>
                  <span className="rounded-full bg-white px-3 py-1.5 shadow-sm dark:bg-slate-900">
                    {user.avgParticipants ?? "—"} participants/évén.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Statistiques agence */}
          <div className="mb-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              {
                label: "Événements gérés",
                value: events.length,
                icon: (
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                ),
                tint: "bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300",
              },
              {
                label: "Billets vendus",
                value: totalTickets,
                icon: (
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h18a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V5a1 1 0 0 1 1-1z" /></svg>
                ),
                tint: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
              },
              {
                label: "Entrées validées",
                value: totalEntered,
                icon: (
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
                ),
                tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
              },
              {
                label: "Chiffre d'affaires",
                value: formatFcfa(totalRevenue),
                icon: (
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>
                ),
                tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
              },
              {
                label: "Commission Sigma",
                value: formatFcfa(commissionAmount),
                icon: (
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></svg>
                ),
                tint: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
              },
              {
                label: "Reversé à l'agence",
                value: formatFcfa(netRevenue),
                icon: (
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></svg>
                ),
                tint: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="group flex items-center gap-5 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
              >
                <div className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${s.tint} transition group-hover:scale-110`}>
                  {s.icon}
                </div>
                <div className="min-w-0">
                  <p className="text-2xl font-extrabold text-slate-900 dark:text-white">{s.value}</p>
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{s.label}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Événements de l'agence */}
          <div className="mb-10">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Événements de l&apos;agence</h2>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                {events.length}
              </span>
            </div>

            {events.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-slate-200 p-14 text-center dark:border-slate-700">
                <svg className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                <p className="mt-3 text-lg font-bold text-slate-800 dark:text-slate-200">Aucun événement géré pour le moment</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Créez un événement pour vos clients — un lien de vente sera généré automatiquement.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:border-slate-800">
                    <tr>
                      <th className="px-6 py-4">Événement</th>
                      <th className="px-4 py-4">Date</th>
                      <th className="px-4 py-4">Billets</th>
                      <th className="px-4 py-4">Entrées</th>
                      <th className="px-4 py-4">Ventes</th>
                      <th className="px-6 py-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {events.map((event) => {
                      const eventRevenue = event.orders.reduce((s, o) => s + o.amount, 0);
                      return (
                        <tr key={event.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-6 py-4">
                            <p className="font-extrabold text-slate-900 dark:text-white">{event.name}</p>
                            <p className="text-xs text-slate-400">{event.location}</p>
                          </td>
                          <td className="px-4 py-4 text-slate-600 dark:text-slate-300">
                            {event.date.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="px-4 py-4 font-bold text-slate-700 dark:text-slate-200">{event._count.tickets}</td>
                          <td className="px-4 py-4 font-bold text-slate-700 dark:text-slate-200">{event._count.checkIns}</td>
                          <td className="px-4 py-4 font-extrabold text-brand-600 dark:text-brand-400">{formatFcfa(eventRevenue)}</td>
                          <td className="px-6 py-4 text-right">
                            <Link
                              href={`/events/${event.id}`}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:text-slate-300"
                            >
                              Gérer
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <Link
              href="/profil"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:text-slate-300"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></svg>
              Détail des ventes
            </Link>
            <Link
              href="/profil"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:text-slate-300"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              Modifier mon profil
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
