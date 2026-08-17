import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrderStatus, Role } from "@/app/generated/prisma/enums";
import Sidebar from "@/components/sidebar";
import EventCoverEditor from "@/components/event-cover-editor";
import { updateEventAction } from "@/app/actions";
import { formatFcfa } from "@/lib/format";

export const metadata = {
  title: "Modifier l'événement — Sigma Events",
};

// Convertit une date en valeur pour <input type="datetime-local"> (heure locale).
function toDatetimeLocal(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser(Role.ORGANIZER);
  const { id } = await params;

  const event = await prisma.event.findFirst({
    where: { id, organizerId: user.id },
    include: { categories: true },
  });
  if (!event) notFound();

  const sidebarEvents = (
    await prisma.event.findMany({
      where: { organizerId: user.id },
      select: { id: true, name: true },
      orderBy: { date: "desc" },
    })
  ).map((e) => ({ id: e.id, name: e.name }));

  // Billets émis + réservations PENDING par catégorie (capacité minimum)
  const soldByCategory = new Map<string, number>();
  const pendingByCategory = new Map<string, number>();
  const [allTickets, allPending] = await Promise.all([
    prisma.ticket.findMany({ where: { eventId: event.id }, select: { categoryId: true } }),
    prisma.order.findMany({
      where: { eventId: event.id, status: OrderStatus.PENDING },
      select: { categoryId: true },
    }),
  ]);
  for (const t of allTickets) {
    if (t.categoryId) soldByCategory.set(t.categoryId, (soldByCategory.get(t.categoryId) ?? 0) + 1);
  }
  for (const o of allPending) {
    if (o.categoryId) pendingByCategory.set(o.categoryId, (pendingByCategory.get(o.categoryId) ?? 0) + 1);
  }
  const minEventCapacity = Math.max(1, allTickets.length + allPending.length);

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white";
  const labelClass = "mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar events={sidebarEvents} activeEventId={event.id} userName={user.name} />
      <div className="lg:pl-[var(--sidebar-w)]">
        <main className="mx-auto max-w-4xl px-4 py-8 pt-20 sm:px-6 lg:pt-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <Link
                href={`/events/${event.id}`}
                className="mb-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                Retour à l&apos;événement
              </Link>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">Modifier l&apos;événement</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {event.name} — les capacités ne peuvent pas descendre sous les billets déjà émis.
              </p>
            </div>
          </div>

          <form action={updateEventAction} className="space-y-6">
            <input type="hidden" name="eventId" value={event.id} />

            {/* Infos générales */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 font-bold text-slate-900 dark:text-white">Informations</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Nom de l&apos;événement *</label>
                  <input name="name" required defaultValue={event.name} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Lieu *</label>
                  <input name="location" required defaultValue={event.location} className={inputClass} />
                </div>
                {/* Type + image de couverture (avec suggestions par type) —
                    regroupés dans un composant client pour le calcul à la volée. */}
                <EventCoverEditor initialType={event.type ?? ""} initialImageUrl={event.imageUrl ?? ""} />
                <div>
                  <label className={labelClass}>Début *</label>
                  <input name="date" type="datetime-local" required defaultValue={toDatetimeLocal(event.date)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Fin (optionnel)</label>
                  <input name="endDate" type="datetime-local" defaultValue={event.endDate ? toDatetimeLocal(event.endDate) : ""} className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>
                    Capacité totale *{" "}
                    <span className="font-normal text-slate-400">(min : {minEventCapacity} — billets émis + réservations)</span>
                  </label>
                  <input name="capacity" type="number" min={minEventCapacity} required defaultValue={event.capacity} className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass}>Description (affichée sur la boutique)</label>
                  <textarea
                    name="description"
                    rows={3}
                    defaultValue={event.description ?? ""}
                    placeholder="Présentez votre événement aux visiteurs…"
                    className={inputClass}
                  />
                </div>

              </div>
            </div>

            {/* Infos pratiques & vente */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-1 font-bold text-slate-900 dark:text-white">Infos pratiques &amp; vente</h2>
              <p className="mb-4 text-xs text-slate-400">Ces informations apparaissent sur la boutique en ligne.</p>

              {/* Mode d'accès */}
              <div className="mb-5">
                <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Mode d&apos;accès</label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {                  [
                    {
                      id: "PUBLIC",
                      title: "Billetterie publique",
                      desc: "Achat en ligne",
                      icon: (
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
                      ),
                    },
                    {
                      id: "INVITE",
                      title: "Invitations privées",
                      desc: "Liste d'invités, aucun paiement",
                      icon: (
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M9 5v2M9 17v2" /></svg>
                      ),
                    },
                    {
                      id: "COMBINED",
                      title: "Billetterie + invités",
                      desc: "Vente + invitations",
                      icon: (
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M9 5v2M9 17v2" /></svg>
                      ),
                    },
                  ].map((m) => (
                    <label
                      key={m.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-xl border-2 border-slate-200 p-3 transition has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:shadow-lg has-[:checked]:shadow-brand-600/10 hover:border-brand-300 dark:border-slate-700 dark:has-[:checked]:border-brand-500 dark:has-[:checked]:bg-brand-950/40 dark:hover:border-brand-700"
                    >
                      <input type="radio" name="mode" value={m.id} defaultChecked={(event.mode ?? "PUBLIC") === m.id} className="peer sr-only" />
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{m.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-xs font-bold text-slate-900 dark:text-white">{m.title}</span>
                        <span className="block text-[11px] text-slate-400">{m.desc}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Ouverture des portes</label>
                  <input name="doorsOpen" type="time" defaultValue={event.doorsOpen ?? ""} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>
                    Quantité max par client{" "}
                    <span className="font-normal text-slate-400">(1 à 10)</span>
                  </label>
                  <input name="maxPerCustomer" type="number" min={1} max={10} defaultValue={event.maxPerCustomer ?? 10} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Contact (nom affiché)</label>
                  <input name="contactName" defaultValue={event.contactName ?? ""} placeholder="Votre nom" className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>Contact (téléphone WhatsApp)</label>
                  <input name="contactPhone" defaultValue={event.contactPhone ?? ""} placeholder="97 00 00 00" className={inputClass} />
                </div>
                <div className="sm:col-span-2">
                  <label className={`${labelClass} flex cursor-pointer items-center gap-3`}>
                    <input type="checkbox" name="salesAtDoor" value="1" defaultChecked={event.salesAtDoor !== false} className="h-4 w-4 accent-brand-600" />
                    <span>
                      Vente à la porte autorisée
                      <span className="block text-xs font-normal text-slate-400">
                        Décochez pour arrêter les ventes en ligne dès le début de l&apos;événement.
                      </span>
                    </span>
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor="zones">
                    Zones d&apos;accès <span className="font-normal text-slate-400">(accréditations — optionnel)</span>
                  </label>
                  <input
                    id="zones"
                    name="zones"
                    defaultValue={event.zones ?? ""}
                    placeholder="main, vip, backstage, parking"
                    className={inputClass}
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    Zones de contrôle : staff, presse, VIP, backstage… Séparez par des virgules. Chaque porte et chaque
                    type de billet peut être limité à une zone (accréditations).
                  </p>
                </div>
              </div>
            </div>

            {/* Catégories de billets */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-1 font-bold text-slate-900 dark:text-white">Types de billets</h2>
              <p className="mb-4 text-xs text-slate-400">
                Prix en FCFA (0 = gratuit). La capacité d&apos;une catégorie ne peut pas être inférieure à ses billets vendus.
              </p>
              <div className="space-y-3">
                {event.categories.map((cat) => {
                  const sold = soldByCategory.get(cat.id) ?? 0;
                  return (
                    <div key={cat.id} className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 p-4 sm:grid-cols-4 dark:border-slate-700">
                      <input type="hidden" name="catId" value={cat.id} />
                      <div className="col-span-2 sm:col-span-1">
                        <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Nom</label>
                        <input name="catName" required defaultValue={cat.name} className={inputClass} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Prix (FCFA)</label>
                        <input name="catPrice" type="number" min={0} defaultValue={cat.price} className={inputClass} />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Places{" "}
                          <span className="font-normal">(min {Math.max(1, sold + (pendingByCategory.get(cat.id) ?? 0))})</span>
                        </label>
                        <input
                          name="catCapacity"
                          type="number"
                          min={Math.max(1, sold + (pendingByCategory.get(cat.id) ?? 0))}
                          defaultValue={cat.capacity}
                          className={inputClass}
                        />
                      </div>
                      <div className="col-span-2 flex items-end sm:col-span-1">
                        <p className="pb-2 text-xs text-slate-400">
                          {sold} vendu{sold > 1 ? "s" : ""}
                          {((pendingByCategory.get(cat.id) ?? 0) > 0 ? ` + ${pendingByCategory.get(cat.id)} réservé(s)` : "")} ·{" "}
                          {formatFcfa(cat.price)}
                        </p>
                      </div>
                      <div className="col-span-2 sm:col-span-4">
                        <label className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">
                          Zones autorisées <span className="font-normal">(accréditations — vide = toutes)</span>
                        </label>
                        <input
                          name="catZones"
                          defaultValue={cat.zones ?? ""}
                          placeholder="main, vip, backstage"
                          className={inputClass}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                Enregistrer les modifications
              </button>
              <Link
                href={`/events/${event.id}`}
                className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-bold text-slate-600 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                Annuler
              </Link>
            </div>
          </form>
        </main>
      </div>
    </div>
  );
}
