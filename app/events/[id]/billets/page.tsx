import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, TicketStatus } from "@/app/generated/prisma/enums";
import PrintButton from "@/components/print-button";
import Logo from "@/components/logo";
import TicketCard from "@/components/ticket-card";
import { TicketPngButton, TicketPngExport } from "@/components/ticket-png-export";

export const metadata = {
  title: "Exporter les billets — Sigma Events",
};

export default async function EventTicketsPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser(Role.ORGANIZER);
  const { id } = await params;

  const event = await prisma.event.findFirst({
    where: { id, organizerId: user.id },
    include: {
      organizer: true,
      tickets: { include: { category: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!event) notFound();

  // Les billets en liste noire ne sont pas exportés (invalides).
  // Les QR sont générés côté client (<TicketCard /> → <LazyQr eager />) : le
  // serveur ne calcule plus un QR par billet — la page s'affiche immédiatement,
  // même pour 500 billets, et l'impression / export PNG attendent les QR prêts.
  const tickets = event.tickets.filter((t) => t.status !== TicketStatus.BLACKLISTED);

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link
            href={`/events/${event.id}`}
            className="flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-slate-900"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Retour à l&apos;événement
          </Link>
          <div className="flex items-center gap-2">
            <TicketPngExport tickets={tickets.map((t) => ({ code: t.code, guestName: t.guestName }))} />
            <PrintButton label="Imprimer les billets" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 print:max-w-none print:p-0">
        <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">{event.name}</h1>
            <p className="text-sm text-slate-500">
              {tickets.length} billet{tickets.length > 1 ? "s" : ""} · Export au format officiel SIGMA.
              {event.tickets.length - tickets.length > 0 && (
                <span className="ml-1 text-red-500">
                  ({event.tickets.length - tickets.length} en liste noire exclu{event.tickets.length - tickets.length > 1 ? "s" : ""})
                </span>
              )}
            </p>
          </div>
          <Logo height={36} className="rounded bg-slate-950 p-1" />
        </div>

        {tickets.length > 300 && (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700 print:hidden">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
            {tickets.length} billets : le navigateur génère les QR (l&apos;impression de centaines de billets reste lourde). Pour une grande liste, privilégiez l&apos;envoi par WhatsApp.
          </div>
        )}

        {tickets.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400 print:hidden">
            Aucun billet à exporter. Ajoutez des invités depuis la page de l&apos;événement.
          </div>
        ) : (
          // 2 colonnes max : des cartes plus larges, mieux pour l'export PNG / l'impression.
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-1 print:gap-0">
            {tickets.map((ticket, i) => (
              <div key={ticket.id} className="relative break-inside-avoid">
                <TicketCard
                  id={ticket.id}
                  eventId={ticket.eventId}
                  code={ticket.code}
                  guestName={ticket.guestName}
                  guestPhone={ticket.guestPhone}
                  guestCount={ticket.guestCount}
                  categoryName={ticket.category?.name}
                  categoryColor={ticket.category?.color}
                  eventName={event.name}
                  eventLocation={event.location}
                  eventDate={event.date}
                  doorsOpen={event.doorsOpen}
                  organizerName={event.organizer?.name ?? event.contactName}
                  imageUrl={event.imageUrl}
                />
                <div className="mt-3 flex justify-center print:hidden">
                  <TicketPngButton index={i} code={ticket.code} guestName={ticket.guestName} />
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
