import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, CheckInStatus } from "@/app/generated/prisma/enums";
import Logo from "@/components/logo";
import Scanner from "@/components/scanner";
import { ThemeToggle } from "@/components/theme-provider";

// Code couleur par statut (cohérent avec le scanner) :
//  VALID/ENTRY → vert, ALREADY_SCANNED → ambre, INVALID/FULL/BLACKLISTED/EXPIRED → rouge,
//  TOO_EARLY → orange.
function statusTone(status: CheckInStatus): string {
  switch (status) {
    case CheckInStatus.VALID:
    case CheckInStatus.ENTRY:
      return "text-brand-400";
    case CheckInStatus.ALREADY_SCANNED:
      return "text-amber-400";
    case CheckInStatus.TOO_EARLY:
      return "text-orange-400";
    default:
      return "text-red-400";
  }
}

function statusIcon(status: CheckInStatus) {
  switch (status) {
    case CheckInStatus.VALID:
    case CheckInStatus.ENTRY:
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
      );
    case CheckInStatus.ALREADY_SCANNED:
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 8v4M12 16h.01" /></svg>
      );
    case CheckInStatus.TOO_EARLY:
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>
      );
    default:
      return (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
      );
  }
}

function statusLabel(status: CheckInStatus): string {
  switch (status) {
    case CheckInStatus.VALID:
      return "Valide";
    case CheckInStatus.ENTRY:
      return "Entrée partielle";
    case CheckInStatus.ALREADY_SCANNED:
      return "Déjà utilisé";
    case CheckInStatus.INVALID:
      return "Invalide";
    case CheckInStatus.FULL:
      return "Complet";
    case CheckInStatus.BLACKLISTED:
      return "Liste noire";
    case CheckInStatus.TOO_EARLY:
      return "Trop tôt";
    case CheckInStatus.EXPIRED:
      return "Terminé";
    default:
      return status;
  }
}

export default async function ScanEventPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const user = await requireUser(Role.AGENT);
  const { eventId } = await params;

  const assignment = await prisma.eventAgent.findUnique({
    where: { eventId_agentId: { eventId, agentId: user.id } },
    include: { event: true },
  });
  if (!assignment) notFound();
  const event = assignment.event;

  const [valid, refused, invalid] = await Promise.all([
    prisma.checkIn.count({ where: { eventId, status: { in: [CheckInStatus.VALID, CheckInStatus.ENTRY] } } }),
    prisma.checkIn.count({ where: { eventId, status: CheckInStatus.ALREADY_SCANNED } }),
    prisma.checkIn.count({ where: { eventId, status: CheckInStatus.INVALID } }),
  ]);
  const pct = event.capacity > 0 ? Math.round((valid / event.capacity) * 100) : 0;

  // Historique personnel de l'agent : ses derniers scans sur cet événement
  // (maquette « Écran 18 — Historique agent »).
  const myRecent = await prisma.checkIn.findMany({
    where: { eventId, agentId: user.id },
    include: { ticket: { include: { category: true } } },
    orderBy: { scannedAt: "desc" },
    take: 12,
  });

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-md items-center gap-3 px-4">
          <Link href="/scan" aria-label="Retour" className="grid h-9 w-9 place-items-center rounded-lg bg-slate-900 text-slate-400 transition hover:bg-slate-800">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-extrabold">{event.name}</h1>
            <p className="truncate text-xs text-slate-400">{event.location}</p>
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-brand-700 bg-brand-950/50 px-2.5 py-1 text-[11px] font-bold text-brand-400">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-400" />
            {pct}%
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-6">
        {/* Compteurs */}
        <div className="mb-5 grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-center">
            <p className="text-xl font-extrabold text-brand-400">{valid}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Validées</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-center">
            <p className="text-xl font-extrabold text-amber-400">{refused}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Déjà scannés</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-3 text-center">
            <p className="text-xl font-extrabold text-red-400">{invalid}</p>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Invalides</p>
          </div>
        </div>

        <div className="mb-2 flex items-center gap-2">
          <Logo height={26} />
          <span className="text-sm font-bold text-slate-300">Scanner le billet</span>
        </div>
        <Scanner eventId={event.id} />

        {/* Historique de mes scans (Écran 18) */}
        <section className="mt-8">
          <div className="mb-3 flex items-center gap-2">
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5" /><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" /><path d="M12 7v5l4 2" /></svg>
            <h2 className="text-sm font-extrabold text-slate-200">Mes derniers scans</h2>
          </div>

          {myRecent.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
              Aucun scan pour le moment. Scannez votre premier billet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-800/80 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              {myRecent.map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-950 ${statusTone(c.status)}`}>
                    {statusIcon(c.status)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-slate-200">
                      {c.ticket?.guestName ?? "Billet inconnu"}
                      {c.ticket?.category?.name && <span className="ml-1.5 text-[11px] font-semibold text-slate-500">{c.ticket.category.name}</span>}
                    </p>
                    <p className={`text-[11px] font-semibold ${statusTone(c.status)}`}>{statusLabel(c.status)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-xs text-slate-400">
                      {c.scannedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    {c.source === "OFFLINE" && (
                      <p className="text-[9px] font-bold uppercase tracking-wide text-sky-400">Hors-ligne</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
