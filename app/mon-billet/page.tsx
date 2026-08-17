import Link from "next/link";
import { prisma } from "@/lib/prisma";
import Logo from "@/components/logo";
import { TicketStatus } from "@/app/generated/prisma/enums";
import { normalizePhone } from "@/lib/csv";
import { displayPhone } from "@/lib/format";
import { isRateLimited } from "@/lib/rate-limit";

export const metadata = {
  title: "Retrouver mon billet — Sigma Security",
};

export default async function FindTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ tel?: string }>;
}) {
  const { tel } = await searchParams;
  const query = tel ? normalizePhone(tel) : "";

  let tickets: Array<{
    id: string;
    code: string;
    guestName: string;
    status: TicketStatus;
    event: { name: string; location: string; date: Date };
    category: { name: string } | null;
  }> = [];
  let searched = false;
  let limited = false;

  if (query.length >= 8) {
    searched = true;
    // Anti-bot : 10 recherches max par numéro sur 1 min.
    limited = await isRateLimited(`monbillet:${query}`, 10, 60_000);
    if (!limited) {
      tickets = await prisma.ticket.findMany({
        where: { guestPhone: query },
        include: { event: true, category: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 pb-16 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Bandeau supérieur */}
      <div className="border-b border-slate-200/60 bg-white/70 backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="Accueil" className="flex items-center gap-3">
            <Logo height={32} />
          </Link>
          <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Retrouver mon billet</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-[11px] font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            Sécurisé
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
        <div className="animate-fade-up overflow-hidden rounded-3xl bg-white shadow-xl dark:bg-slate-900">
          <div className="relative bg-gradient-to-br from-brand-700 via-brand-800 to-slate-900 px-6 py-8 text-white sm:px-8">
            <h1 className="text-2xl font-extrabold sm:text-3xl">Vous avez perdu votre billet ?</h1>
            <p className="mt-2 max-w-lg text-sm text-brand-100">
              Entrez le numéro de téléphone utilisé à l&apos;achat pour retrouver tous vos billets et leurs QR codes.
            </p>
          </div>

          <div className="p-6 sm:p-8">
            {/* Recherche */}
            <form className="flex flex-col gap-3 sm:flex-row" action="/mon-billet" method="get">
              <input
                type="tel"
                name="tel"
                required
                defaultValue={query}
                placeholder="97 00 00 00"
                inputMode="tel"
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <button
                type="submit"
                className="shrink-0 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5"
              >
                Retrouver mes billets
              </button>
            </form>

            {/* Résultats */}
            {searched && (
              <div className="mt-8">
                {limited ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-900 dark:bg-amber-950/40">
                    <svg className="mx-auto h-10 w-10 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                    <p className="mt-2 text-sm font-bold text-amber-700 dark:text-amber-300">
                      Trop de recherches. Réessayez dans une minute.
                    </p>
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-8 text-center dark:border-slate-700 dark:bg-slate-800/60">
                    <svg className="mx-auto h-10 w-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                    <p className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                      Aucun billet trouvé pour ce numéro
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Vérifiez le numéro saisi (format : 97 12 34 56). Si vous avez acheté avec un autre numéro,
                      réessayez avec celui-ci.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                      {tickets.length} billet{tickets.length > 1 ? "s" : ""} trouvé{tickets.length > 1 ? "s" : ""} pour{" "}
                      <span className="font-mono font-bold text-brand-600 dark:text-brand-400">{displayPhone(query)}</span>
                    </p>
                    {tickets.map((t) => {
                      const entered = t.status === TicketStatus.ENTERED;
                      const blacklisted = t.status === TicketStatus.BLACKLISTED;
                      return (
                        <div
                          key={t.id}
                          className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 p-5 transition hover:shadow-lg dark:border-slate-700"
                        >
                          <div
                            className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
                              blacklisted
                                ? "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400"
                                : entered
                                  ? "bg-brand-100 text-brand-600 dark:bg-brand-950 dark:text-brand-400"
                                  : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                            }`}
                          >
                            {blacklisted ? (
                              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                            ) : entered ? (
                              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                            ) : (
                              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M13 5v2M13 17v2M13 11v2" /></svg>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-bold text-slate-900 dark:text-white">{t.event.name}</p>
                            <p className="flex items-center gap-1 truncate text-xs text-slate-400">
                              <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                              {t.event.location} ·{" "}
                              {t.event.date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {t.category?.name ?? "Billet"} · {t.guestName}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${
                              blacklisted
                                ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                                : entered
                                  ? "bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            }`}
                          >
                            {blacklisted ? "Refusé" : entered ? "Déjà utilisé" : "Valide"}
                          </span>
                          <Link
                            href={`/t/${t.code}`}
                            className="shrink-0 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5"
                          >
                            Voir mon billet
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {!searched && (
              <div className="mt-8 grid grid-cols-1 gap-3 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-3">
                <div className="flex items-start gap-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></svg>
                  <p>Utilisez le numéro que vous avez indiqué lors de l&apos;achat.</p>
                </div>
                <div className="flex items-start gap-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M13 5v2M13 17v2M13 11v2" /></svg>
                  <p>Vos billets (et leurs QR) s&apos;afficheront ici à tout moment.</p>
                </div>
                <div className="flex items-start gap-2 rounded-2xl bg-slate-50 p-4 dark:bg-slate-800/60">
                  <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  <p>Un billet acheté en ligne vous est aussi envoyé sur WhatsApp.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          Propulsé par <span className="font-bold text-slate-500 dark:text-slate-400">Sigma Security</span> — Bénin
        </p>
      </div>
    </main>
  );
}
