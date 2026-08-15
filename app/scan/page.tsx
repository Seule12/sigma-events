import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/app/generated/prisma/enums";
import Logo from "@/components/logo";
import { ThemeToggle } from "@/components/theme-provider";
import { logoutAction } from "@/app/actions";

export default async function ScanHomePage() {
  const user = await requireUser(Role.AGENT);

  const assignments = await prisma.eventAgent.findMany({
    where: { agentId: user.id },
    include: {
      event: {
        include: { _count: { select: { checkIns: { where: { status: "VALID" } } } } },
      },
    },
    orderBy: { event: { date: "desc" } },
  });

  return (
    <div className="min-h-screen bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-md items-center gap-3 px-4">
          <Logo height={36} className="rounded bg-white p-1" />
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <form action={logoutAction}>
              <button type="submit" aria-label="Se déconnecter" className="grid h-10 w-10 place-items-center rounded-xl border border-slate-800 text-slate-400 transition hover:border-red-800 hover:text-red-400">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-extrabold text-white">Bonjour, {user.name.split(" ")[0]}</h1>
          <p className="mt-1 text-sm text-slate-400">Choisissez un événement pour commencer le contrôle.</p>
        </div>

        {assignments.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-800 p-10 text-center">
            <p className="text-slate-400">Aucun événement assigné.</p>
            <p className="mt-1 text-sm text-slate-600">Contactez votre agence pour être assigné à un événement.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map(({ event }) => {
              const pct = event.capacity > 0 ? Math.round((event._count.checkIns / event.capacity) * 100) : 0;
              return (
                <Link
                  key={event.id}
                  href={`/scan/${event.id}`}
                  className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 transition hover:border-brand-600 hover:bg-slate-800"
                >
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-slate-950 text-center">
                    <div>
                      <div className="text-base font-extrabold leading-none text-white">{event.date.getDate()}</div>
                      <div className="text-[9px] font-bold uppercase tracking-wide text-brand-400">
                        {event.date.toLocaleDateString("fr-FR", { month: "short" })}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-bold text-white">{event.name}</h3>
                    <p className="truncate text-xs text-slate-400">{event.location}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-800">
                        <div className={`h-full rounded-full ${pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[11px] font-semibold text-slate-400">{pct}%</span>
                    </div>
                  </div>
                  <svg className="h-5 w-5 shrink-0 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
