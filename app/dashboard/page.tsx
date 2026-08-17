import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, CheckInStatus } from "@/app/generated/prisma/enums";
import Sidebar from "@/components/sidebar";
import { formatFcfa } from "@/lib/format";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { welcome } = await searchParams;
  const user = await requireUser(Role.ORGANIZER);

  const events = await prisma.event.findMany({
    where: { organizerId: user.id },
    include: { _count: { select: { tickets: true } } },
    orderBy: { date: "desc" },
  });
  const sidebarEvents = events.map((e) => ({ id: e.id, name: e.name }));

  // Entrées validées par événement : UNE seule requête GROUP BY au lieu d'un
  // COUNT par événement (N+1) — essentiel quand l'organisateur a beaucoup d'événements.
  const eventIds = events.map((e) => e.id);
  const enteredRows = eventIds.length
    ? await prisma.checkIn.groupBy({
        by: ["eventId"],
        where: { eventId: { in: eventIds }, status: { in: [CheckInStatus.VALID, CheckInStatus.ENTRY] } },
        _count: { _all: true },
      })
    : [];
  const enteredByEvent = new Map(enteredRows.map((r) => [r.eventId, r._count._all]));
  const stats = events.map((event) => ({ event, entered: enteredByEvent.get(event.id) ?? 0 }));

  const totalTickets = events.reduce((s, e) => s + e._count.tickets, 0);
  const totalEntered = stats.reduce((s, st) => s + st.entered, 0);
  const liveCount = events.filter((e) => e.status === "LIVE").length;

  // Ventes des 14 derniers jours (commandes payées) pour le mini-graphique.
  const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const recentOrders = await prisma.order.findMany({
    where: { eventId: { in: events.map((e) => e.id) }, createdAt: { gte: since14 } },
    select: { createdAt: true, amount: true },
  });
  // Agrégation des ventes par jour : une seule passe sur les commandes (Map) au
  // lieu de 14 filtres + reduce sur la liste entière à chaque itération.
  const salesByDay = new Map<string, number>();
  for (const o of recentOrders) {
    const key = o.createdAt.toDateString();
    salesByDay.set(key, (salesByDay.get(key) ?? 0) + o.amount);
  }
  const days14: { label: string; amount: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    days14.push({
      label: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      amount: salesByDay.get(d.toDateString()) ?? 0,
    });
  }
  const chartMax = Math.max(...days14.map((d) => d.amount), 1);
  const totalRevenue14 = days14.reduce((s, d) => s + d.amount, 0);

  const firstName = user.name.split(" ")[0];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar events={sidebarEvents} userName={user.name} />

      <div className="lg:pl-[var(--sidebar-w)]">
        <main className="mx-auto max-w-6xl px-4 py-10 pt-24 sm:px-6 lg:pt-12">
          {/* Bandeau bienvenue (après inscription) */}
          {welcome === "1" && (
            <div className="animate-fade-up mb-8 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm font-semibold text-brand-700 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-white">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </span>
              Bienvenue sur Sigma Events, {firstName} ! Créez votre premier événement pour générer votre lien de vente.
            </div>
          )}

          {/* Hero d'accueil */}
          <div className="relative mb-10 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {/* Fond : dégradé brand + grille décorative masquée */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-500/[0.08] via-transparent to-emerald-500/[0.06]" />
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgb(15 118 110 / 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgb(15 118 110 / 0.05) 1px, transparent 1px)",
                backgroundSize: "30px 30px",
                maskImage: "radial-gradient(ellipse 85% 100% at 85% 0%, black 25%, transparent 78%)",
                WebkitMaskImage: "radial-gradient(ellipse 85% 100% at 85% 0%, black 25%, transparent 78%)",
              }}
            />
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-brand-500/10 blur-3xl" />

            <div className="relative flex flex-wrap items-center justify-between gap-6 p-6 sm:p-8">
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-brand-600 dark:text-brand-400">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-500" />
                  </span>
                  Tableau de bord
                </p>
                <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
                  Bonjour, {firstName}
                </h1>
                <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                  Gérez vos événements, vos invités et le contrôle d&apos;accès en temps réel.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {liveCount > 0 && (
                  <span className="flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {liveCount} événement{liveCount > 1 ? "s" : ""} en cours
                  </span>
                )}
                <Link
                  href="/events/create"
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-xl"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  Nouvel événement
                </Link>
              </div>
            </div>
          </div>

          {/* Statistiques — cartes KPI à bordure colorée (langage SIGMA EVENTS) */}
          <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                label: "Événements",
                value: events.length,
                color: "#00e676",
                hint: events.length > 0 ? `${events.length} événement${events.length > 1 ? "s" : ""} créé${events.length > 1 ? "s" : ""}` : "Créez votre premier événement",
                icon: (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                ),
              },
              {
                label: "Billets émis",
                value: totalTickets,
                color: "#60a5fa",
                hint: "Ventes en ligne + invitations",
                icon: (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M9 5v2M9 17v2" /></svg>
                ),
              },
              {
                label: "Entrées validées",
                value: totalEntered,
                color: "#f59e0b",
                hint: "Scannées par vos agents",
                icon: (
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" /></svg>
                ),
              },
            ].map((s) => (
              <div
                key={s.label}
                className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
                style={{ borderTop: `3px solid ${s.color}` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{s.label}</p>
                    <p className="mt-2 font-display text-4xl font-extrabold" style={{ color: s.color }}>
                      {s.value}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">{s.hint}</p>
                  </div>
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-transform duration-200 group-hover:scale-110"
                    style={{ backgroundColor: `${s.color}1a`, color: s.color }}
                  >
                    {s.icon}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Ventes — 14 derniers jours (mini-graphique) */}
          <div className="mb-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">
                  Ventes — 14 derniers jours
                </p>
                <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Chiffre d&apos;affaires
                </h2>
              </div>
              <span className="flex items-baseline gap-1 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-800">
                <span className="font-display text-xl font-extrabold text-brand-600 dark:text-brand-400">{formatFcfa(totalRevenue14)}</span>
                <span className="text-xs font-semibold text-slate-400">sur 14 jours</span>
              </span>
            </div>
            <div className="flex h-28 items-end gap-1.5">
              {days14.map((d, i) => {
                const h = Math.max((d.amount / chartMax) * 100, 3);
                const isLast = i === days14.length - 1;
                return (
                  <div key={i} className="group flex h-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="pointer-events-none font-mono text-[9px] font-bold text-slate-400 opacity-0 transition group-hover:opacity-100">
                      {d.amount.toLocaleString("fr-FR")}
                    </span>
                    <div
                      className={`w-full rounded-t-md transition-all duration-500 ${
                        isLast
                          ? "bg-gradient-to-t from-brand-600 to-brand-400 shadow-lg shadow-brand-500/30"
                          : "bg-brand-500/25 hover:bg-brand-500/50"
                      }`}
                      style={{ height: `${h}%` }}
                      title={`${d.label} · ${d.amount.toLocaleString("fr-FR")} F`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between font-mono text-[9px] text-slate-400">
              <span>{days14[0].label}</span>
              <span>{days14[7].label}</span>
              <span>{days14[13].label}</span>
            </div>
          </div>

          {/* Mes événements — grille de cartes */}
          <div className="mb-10">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                </span>
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">Vos événements</p>
                  <h2 className="mt-0.5 font-display text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Mes événements</h2>
                </div>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                {events.length}
              </span>
            </div>

            {events.length === 0 ? (
              <div className="rounded-3xl border-2 border-dashed border-slate-200 p-14 text-center dark:border-slate-700">
                <svg className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                <p className="mt-3 text-lg font-bold text-slate-800 dark:text-slate-200">Aucun événement pour le moment</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Créez votre premier événement avec le bouton « Nouvel événement » — un lien de vente sera généré automatiquement.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {stats.map(({ event, entered }) => {
                  const pct = event.capacity > 0 ? Math.round((entered / event.capacity) * 100) : 0;
                  const isLive = event.status === "LIVE";
                  const isDraft = event.status === "DRAFT";
                  const mode =
                    event.mode === "INVITE"
                      ? "Invitations"
                      : event.mode === "COMBINED"
                        ? "Mixte"
                        : "Billetterie";
                  return (
                    <div
                      key={event.id}
                      className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-800"
                    >
                      <div
                        className={`absolute inset-x-0 top-0 h-1 ${
                          isLive
                            ? "bg-gradient-to-r from-brand-500 via-emerald-400 to-transparent"
                            : "bg-gradient-to-r from-slate-300 to-transparent dark:from-slate-600"
                        }`}
                      />
                      <div className="flex items-start justify-between gap-4">
                        <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-slate-900 text-center text-white ring-1 ring-inset ring-white/10 dark:bg-slate-800">
                          <div>
                            <div className="font-display text-lg font-extrabold leading-none">{event.date.getDate()}</div>
                            <div className="text-[10px] font-bold uppercase tracking-wide text-brand-400">
                              {event.date.toLocaleDateString("fr-FR", { month: "short" })}
                            </div>
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="truncate text-base font-extrabold text-slate-900 transition group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-400">
                              {event.name}
                            </h3>
                            <span
                              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                                isDraft
                                  ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"
                                  : event.status === "DONE"
                                    ? "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                              }`}
                            >
                              {isDraft ? "Brouillon" : event.status === "DONE" ? "Terminé" : "Annoncé"}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                            {event.location} · {mode}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            {event.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5">
                        <div className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-400">
                          <span>Jauge</span>
                          <span className={pct >= 100 ? "font-bold text-red-500" : pct >= 80 ? "font-bold text-amber-500" : "font-bold text-brand-600 dark:text-brand-400"}>
                            {entered}/{event.capacity} · {pct}%
                          </span>
                        </div>
                        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? "bg-gradient-to-r from-red-500 to-red-600" : pct >= 80 ? "bg-gradient-to-r from-amber-500 to-amber-600" : "bg-gradient-to-r from-brand-500 to-brand-700"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="mt-5 flex items-center justify-between gap-2">
                        <Link
                          href={`/events/${event.id}`}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-brand-600/25 transition hover:-translate-y-0.5"
                        >
                          Gérer
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                        </Link>
                        {event.salesSlug && (
                          <Link
                            href={`/acheter/${event.salesSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-500 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:text-slate-300"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
                            Boutique
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
