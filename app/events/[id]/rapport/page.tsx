import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role, CheckInStatus } from "@/app/generated/prisma/enums";
import PrintButton from "@/components/print-button";
import Logo from "@/components/logo";

const STATUS_BADGE: Record<CheckInStatus, string> = {
  [CheckInStatus.VALID]: "bg-brand-100 text-brand-700",
  [CheckInStatus.ENTRY]: "bg-brand-100 text-brand-700",
  [CheckInStatus.ALREADY_SCANNED]: "bg-amber-100 text-amber-700",
  [CheckInStatus.INVALID]: "bg-red-100 text-red-700",
  [CheckInStatus.FULL]: "bg-red-100 text-red-700",
  [CheckInStatus.BLACKLISTED]: "bg-red-100 text-red-700",
  [CheckInStatus.TOO_EARLY]: "bg-amber-100 text-amber-700",
  [CheckInStatus.EXPIRED]: "bg-red-100 text-red-700",
  [CheckInStatus.WRONG_ZONE]: "bg-amber-100 text-amber-700",
  [CheckInStatus.SUSPENDED]: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<CheckInStatus, string> = {
  [CheckInStatus.VALID]: "Entrée validée",
  [CheckInStatus.ENTRY]: "Entrée partielle",
  [CheckInStatus.ALREADY_SCANNED]: "Déjà scanné",
  [CheckInStatus.INVALID]: "Billet invalide",
  [CheckInStatus.FULL]: "Capacité atteinte",
  [CheckInStatus.BLACKLISTED]: "Liste noire",
  [CheckInStatus.TOO_EARLY]: "Trop tôt",
  [CheckInStatus.EXPIRED]: "Événement terminé",
  [CheckInStatus.WRONG_ZONE]: "Mauvaise zone",
  [CheckInStatus.SUSPENDED]: "Entrées suspendues",
};

export default async function EventReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser(Role.ORGANIZER);
  const { id } = await params;

  const event = await prisma.event.findFirst({
    where: { id, organizerId: user.id },
    include: {
      tickets: { include: { category: true } },
      checkIns: {
        include: {
          ticket: { include: { category: true } },
          agent: { select: { name: true } },
        },
        orderBy: { scannedAt: "asc" },
      },
    },
  });
  if (!event) notFound();

  const byStatus = {
    [CheckInStatus.VALID]: event.checkIns.filter((c) => c.status === CheckInStatus.VALID).length,
    [CheckInStatus.ENTRY]: event.checkIns.filter((c) => c.status === CheckInStatus.ENTRY).length,
    [CheckInStatus.ALREADY_SCANNED]: event.checkIns.filter((c) => c.status === CheckInStatus.ALREADY_SCANNED).length,
    [CheckInStatus.INVALID]: event.checkIns.filter((c) => c.status === CheckInStatus.INVALID).length,
    [CheckInStatus.FULL]: event.checkIns.filter((c) => c.status === CheckInStatus.FULL).length,
    [CheckInStatus.BLACKLISTED]: event.checkIns.filter((c) => c.status === CheckInStatus.BLACKLISTED).length,
    [CheckInStatus.TOO_EARLY]: event.checkIns.filter((c) => c.status === CheckInStatus.TOO_EARLY).length,
    [CheckInStatus.EXPIRED]: event.checkIns.filter((c) => c.status === CheckInStatus.EXPIRED).length,
    [CheckInStatus.WRONG_ZONE]: event.checkIns.filter((c) => c.status === CheckInStatus.WRONG_ZONE).length,
    [CheckInStatus.SUSPENDED]: event.checkIns.filter((c) => c.status === CheckInStatus.SUSPENDED).length,
  };
  // Personnes entrées (chaque check-in VALID ou ENTRY = 1 personne physique).
  const entered = byStatus[CheckInStatus.VALID] + byStatus[CheckInStatus.ENTRY];
  const pct = event.capacity > 0 ? Math.round((entered / event.capacity) * 100) : 0;

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href={`/events/${event.id}`} className="flex items-center gap-2 text-sm font-bold text-slate-500 transition hover:text-slate-900">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            Retour à l&apos;événement
          </Link>
          <PrintButton label="Imprimer / PDF" />
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 print:max-w-none print:p-0">
        {/* En-tête du rapport */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:rounded-none print:border-0 print:shadow-none">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-600">Rapport de contrôle d&apos;accès</p>
              <h1 className="mt-1 text-2xl font-extrabold text-slate-900">{event.name}</h1>
              <p className="mt-1 text-sm text-slate-500">
                {event.location} ·{" "}
                {event.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>
            <Logo height={40} className="rounded bg-slate-950 p-1" />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <p className="text-2xl font-extrabold text-slate-900">{event.tickets.length}</p>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Billets émis</p>
            </div>
            <div className="rounded-xl bg-brand-50 p-4 text-center">
              <p className="text-2xl font-extrabold text-brand-600">{entered}</p>
              <p className="text-[11px] font-bold uppercase tracking-wide text-brand-400">Entrées (personnes)</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-4 text-center">
              <p className="text-2xl font-extrabold text-amber-600">{byStatus[CheckInStatus.ALREADY_SCANNED]}</p>
              <p className="text-[11px] font-bold uppercase tracking-wide text-amber-400">Déjà scannés</p>
            </div>
            <div className="rounded-xl bg-red-50 p-4 text-center">
              <p className="text-2xl font-extrabold text-red-600">{byStatus[CheckInStatus.INVALID] + byStatus[CheckInStatus.FULL] + byStatus[CheckInStatus.BLACKLISTED] + byStatus[CheckInStatus.TOO_EARLY] + byStatus[CheckInStatus.EXPIRED] + byStatus[CheckInStatus.WRONG_ZONE] + byStatus[CheckInStatus.SUSPENDED]}</p>
              <p className="text-[11px] font-bold uppercase tracking-wide text-red-400">Refusés</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 text-center">
              <p className="text-2xl font-extrabold text-slate-900">{pct}%</p>
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Jauge ({entered}/{event.capacity})</p>
            </div>
          </div>

          <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-brand-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Journal des scans */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:rounded-none print:border-0 print:shadow-none">
          <h2 className="mb-4 font-bold text-slate-900">Journal des entrées ({event.checkIns.length})</h2>
          {event.checkIns.length === 0 ? (
            <p className="text-sm text-slate-400">Aucun scan enregistré pour le moment.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-bold uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3">Statut</th>
                    <th className="py-2 pr-3">Participant</th>
                    <th className="py-2 pr-3">Catégorie</th>
                    <th className="py-2 pr-3">Billet</th>
                    <th className="py-2 pr-3">Agent</th>
                    <th className="py-2">Date et heure</th>
                  </tr>
                </thead>
                <tbody>
                  {event.checkIns.map((c) => (
                    <tr key={c.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-3">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_BADGE[c.status]}`}>
                          {STATUS_LABEL[c.status]}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-semibold text-slate-800">{c.ticket?.guestName ?? "—"}</td>
                      <td className="py-2 pr-3 text-slate-500">{c.ticket?.category?.name ?? "—"}</td>
                      <td className="py-2 pr-3 font-mono text-xs text-slate-400">{c.ticket?.code ?? "—"}</td>
                      <td className="py-2 pr-3 text-slate-500">{c.agent?.name ?? "—"}</td>
                      <td className="py-2 text-slate-500">
                        {c.scannedAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                        {c.source === "OFFLINE" && <span className="ml-1 text-[10px] font-bold text-sky-500">· hors-ligne</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-400 print:mt-10">
          Rapport généré par Sigma Events — {new Date().toLocaleDateString("fr-FR", { dateStyle: "long" })}
        </p>
      </main>
    </div>
  );
}
