import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TicketStatus, InvitationStatus } from "@/app/generated/prisma/enums";
import Logo from "@/components/logo";
import { ticketQrDataUrl } from "@/lib/qr";

export const metadata = {
  title: "Votre invitation — Sigma Events",
};

// Page publique : l'invité ouvre le lien qu'il a reçu (WhatsApp / email) et voit
// son invitation nominative avec le QR à présenter à l'entrée.
export default async function InvitationPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ticket = await prisma.ticket.findUnique({
    where: { code: code.toUpperCase() },
    include: { event: true, category: true },
  });
  if (!ticket || ticket.status === TicketStatus.BLACKLISTED || ticket.inviteStatus === InvitationStatus.CANCELLED) {
    notFound();
  }

  // Passage au statut « OUVERT » : le destinataire a consulté son invitation.
  if (ticket.inviteStatus === InvitationStatus.GENERATED || ticket.inviteStatus === InvitationStatus.SENT) {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { inviteStatus: InvitationStatus.OPENED },
    });
  }

  const qr = await ticketQrDataUrl(ticket, 240);
  const event = ticket.event;
  const guestCount = Math.max(1, ticket.guestCount || 1);
  const enteredCount = Math.min(guestCount, ticket.entriesCount);
  const fullyEntered = ticket.status === TicketStatus.ENTERED || enteredCount >= guestCount;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto flex max-w-md flex-col items-center py-6">
        <div className="mb-5 flex items-center gap-2">
          <Logo height={30} className="rounded-lg bg-slate-950 p-1" />
          <span className="text-sm font-extrabold text-slate-800 dark:text-white">
            Sigma <span className="text-brand-600 dark:text-brand-400">Events</span>
          </span>
        </div>

        <div className="animate-fade-up w-full overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900">
          {/* En-tête de l'événement */}
          <div className="relative overflow-hidden bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-7 text-white">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-200">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M9 5v2M9 17v2" /></svg>
              Invitation nominative
            </p>
            <h1 className="mt-1.5 text-xl font-extrabold leading-tight">{event.name}</h1>
            <p className="mt-2 flex items-center gap-1.5 text-xs text-brand-100">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              {event.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              {event.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) !== "00:00" && (
                <> · {event.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</>
              )}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-brand-100">
              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
              {event.location}
            </p>
            {event.doorsOpen && (
              <p className="mt-1 flex items-center gap-1.5 text-xs text-brand-200">
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                Portes ouvertes à {event.doorsOpen}
              </p>
            )}
          </div>

          {/* Corps : QR + invité */}
          <div className="p-7 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400">Cette invitation est au nom de</p>
            <p className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-white">{ticket.guestName}</p>

            <div className="mx-auto mt-5 inline-block rounded-2xl bg-slate-50 p-3 dark:bg-slate-800">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt={`QR code invitation ${ticket.guestName}`} className="h-44 w-44 rounded-xl bg-white p-1.5" />
              ) : (
                <div className="grid h-44 w-44 place-items-center rounded-xl bg-white text-xs text-slate-400">QR indisponible</div>
              )}
            </div>

            <p className="mt-3 font-mono text-[11px] text-slate-400">#{ticket.code}</p>

            {/* Accès autorisé */}
            <div className="mt-5 rounded-2xl border border-brand-100 bg-brand-50 p-4 dark:border-brand-900 dark:bg-brand-950/40">
              <p className="text-xs font-bold uppercase tracking-wide text-brand-600 dark:text-brand-400">Accès autorisé</p>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-sm font-extrabold text-slate-900 dark:text-white">
                {guestCount > 1 && (
                  <svg className="h-4 w-4 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                )}
                {guestCount > 1 ? `${guestCount} personnes autorisées` : "1 personne"}
              </p>
              {ticket.category && (
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Catégorie : <b>{ticket.category.name}</b>
                </p>
              )}
              {fullyEntered ? (
                <p className="mt-2 inline-block rounded-full bg-brand-600 px-3 py-1 text-xs font-bold text-white">
                  ✓ Toutes les entrées ont été consommées
                </p>
              ) : guestCount > 1 && enteredCount > 0 ? (
                <p className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  {enteredCount}/{guestCount} entrées déjà utilisées
                </p>
              ) : (
                <p className="mt-2 inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  ✓ Invitation valide — présentez ce QR à l&apos;entrée
                </p>
              )}
            </div>

            <p className="mt-5 text-xs leading-relaxed text-slate-400">
              Présentez ce QR code à l&apos;agent de contrôle à l&apos;entrée.
              {guestCount > 1 && " Chaque personne autorisée entre avec vous : le compteur se met à jour à chaque passage."}
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
          Propulsé par <b>Sigma Events</b> — contrôle d&apos;accès événementiel · Bénin
        </p>
      </div>
    </main>
  );
}
