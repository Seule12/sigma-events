import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ticketQrDataUrl } from "@/lib/qr";
import Logo from "@/components/logo";
import CoverImage from "@/components/cover-image";
import TicketPresent from "@/components/ticket-present";
import TicketLiveStatus from "@/components/ticket-live-status";
import { TicketStatus } from "@/app/generated/prisma/enums";


// Lien « Ajouter à mon agenda » (Google Calendar) — maquette écran 19.
function calendarLink(event: { name: string; location: string; date: Date; endDate: Date | null }): string {
  const start = new Date(event.date);
  const end = event.endDate ?? new Date(start.getTime() + 8 * 3600_000);
  const fmt = (d: Date) =>
    `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.name,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: "Billet officiel Sigma Events — présentez le QR code à l'entrée.",
    location: event.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default async function TicketPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { code: code.toUpperCase() },
    include: { event: true, category: true },
  });
  if (!ticket) notFound();

  const qr = await ticketQrDataUrl(ticket, 280);

  const entered = ticket.status === TicketStatus.ENTERED;

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="animate-fade-up w-full max-w-sm">
        {/* Billet */}
        <div className={`overflow-hidden rounded-3xl bg-white shadow-2xl ${entered ? "ring-4 ring-brand-500/30" : ""} dark:bg-slate-900`}>
          {/* Image de couverture (fond dégradé de secours) */}
          {ticket.event.imageUrl && (
            <div className="relative h-36 w-full overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-slate-900">
              <CoverImage src={ticket.event.imageUrl} alt={ticket.event.name} />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </div>
          )}
          {/* En-tête événement */}
          <div className="relative bg-gradient-to-br from-brand-600 to-brand-800 px-6 pb-10 pt-6 text-white">
            <div className="absolute right-4 top-4 rounded-xl bg-white p-1.5">
              <Logo height={28} />
            </div>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-200">
              {ticket.category?.name ?? "Billet"}
            </p>
            <h1 className="mt-1 pr-14 text-xl font-extrabold leading-tight">{ticket.event.name}</h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-brand-100">
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              {ticket.event.location}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-brand-100">
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              {ticket.event.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>

          {/* QR */}
          <div className="relative -mt-6 px-6">
            <div className="rounded-2xl bg-white p-4 shadow-lg dark:bg-white">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR code du billet" className="mx-auto h-52 w-52" />
              ) : (
                <p className="p-8 text-center text-xs text-slate-400">QR indisponible.</p>
              )}
            </div>
          </div>

          {/* Statut en direct (auto-rafraîchissement) */}
          <TicketLiveStatus code={ticket.code} />

          {/* Infos invité */}
          <div className="px-6 pb-6 pt-4 text-center">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invité</p>
            <p className="text-lg font-extrabold text-slate-900 dark:text-white">{ticket.guestName}</p>

            {entered ? (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                Déjà utilisé
              </div>
            ) : ticket.status === TicketStatus.BLACKLISTED ? (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                Billet refusé
              </div>
            ) : (
              <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                Présentez ce QR code à l&apos;entrée
              </p>
            )}

            <p className="mt-4 font-mono text-[11px] text-slate-300 dark:text-slate-600">{ticket.code}</p>
          </div>

          {/* Présentation plein écran (standard marché) */}
          <div className="px-6 pb-4">
            {qr ? <TicketPresent qr={qr} code={ticket.code} /> : null}
          </div>

          {/* Ajouter à mon agenda */}
          <div className="px-6 pb-6">
            <a
              href={calendarLink(ticket.event)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-brand-500"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01" /></svg>
              Ajouter à mon agenda
            </a>
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400 dark:text-slate-500">
          Propulsé par <span className="font-bold text-slate-500 dark:text-slate-400">Sigma Events</span> — Bénin
        </p>
      </div>
    </main>
  );
}
