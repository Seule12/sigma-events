import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/app/generated/prisma/enums";
import Sidebar from "@/components/sidebar";
import SettingsForms from "@/components/settings-forms";

export const metadata = {
  title: "Mon Profil — Sigma Security",
};

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string; pinChanged?: string; pinErr?: string; profileErr?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser(Role.ORGANIZER);

  const events = await prisma.event.findMany({
    where: { organizerId: user.id },
    select: { id: true, name: true },
    orderBy: { date: "desc" },
  });
  const sidebarEvents = events.map((e) => ({ id: e.id, name: e.name }));

  const updated = sp.updated === "1";
  const pinChanged = sp.pinChanged === "1";
  const pinErr = sp.pinErr ?? null;
  const profileErr = sp.profileErr === "1";

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar events={sidebarEvents} userName={user.name} />

      <div className="lg:pl-[var(--sidebar-w)]">
        <main className="mx-auto max-w-4xl px-4 py-10 pt-24 sm:px-6 lg:pt-12">
          {/* En-tête avec navigation vers Ventes */}
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-brand-600 dark:text-brand-400">Mon Compte</p>
              <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">Profil</h1>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                Gérez vos informations personnelles et la sécurité de votre compte.
              </p>
            </div>
            <Link
              href="/ventes"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-800"
            >
              <svg className="h-4 w-4 text-brand-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
              Suivi des ventes
            </Link>
          </div>

          {/* Bandeaux de succès */}
          {updated && (
            <div className="animate-fade-up mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              Vos informations ont été enregistrées.
            </div>
          )}
          {pinChanged && (
            <div className="animate-fade-up mb-6 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
              <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              Votre code personnel a été mis à jour.
            </div>
          )}

          {/* Carte d'Identité Visuelle */}
          <div className="mb-10 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-6">
              <div className="relative">
                <div className="grid h-20 w-20 place-items-center rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 text-2xl font-extrabold text-white shadow-xl shadow-brand-600/30">
                  {user.name
                    .split(" ")
                    .map((w) => w[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <span className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm ring-4 ring-white dark:ring-slate-900">
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">{user.name}</h2>
                  <span className="rounded-full bg-brand-100 px-3 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                    Organisateur
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {user.phone ? `+229 ${user.phone}` : user.email ?? "Compte social"} · Membre depuis{" "}
                  {user.createdAt.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                </p>
              </div>
            </div>
          </div>

          {/* Formulaires de gestion */}
          <SettingsForms name={user.name} pinErr={pinErr} profileErr={profileErr} />

          {/* Détails du compte en lecture seule */}
          <section className="mt-10 rounded-3xl border border-slate-200 bg-slate-50/50 p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900/50">
            <div className="mb-6 flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-600 shadow-sm dark:bg-slate-800 dark:text-slate-300">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
              </div>
              <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">Détails du compte</h2>
            </div>

            <dl className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 shrink-0 grid place-items-center rounded-lg bg-white text-slate-400 shadow-sm dark:bg-slate-800">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 2 2 0 0 1-2-2v-1a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v1a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-3" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>
                </span>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Email</dt>
                  <dd className="text-sm font-semibold text-slate-900 dark:text-white">{user.email ?? user.orgEmail ?? "—"}</dd>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 shrink-0 grid place-items-center rounded-lg bg-white text-slate-400 shadow-sm dark:bg-slate-800">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                </span>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Téléphone</dt>
                  <dd className="text-sm font-semibold text-slate-900 dark:text-white">+229 {user.phone}</dd>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 shrink-0 grid place-items-center rounded-lg bg-white text-slate-400 shadow-sm dark:bg-slate-800">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                </span>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Membre depuis</dt>
                  <dd className="text-sm font-semibold text-slate-900 dark:text-white">
                    {user.createdAt.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                  </dd>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="h-8 w-8 shrink-0 grid place-items-center rounded-lg bg-white text-slate-400 shadow-sm dark:bg-slate-800">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                </span>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Commission Sigma</dt>
                  <dd className="text-sm font-semibold text-slate-900 dark:text-white">{user.commissionRate} % sur les ventes</dd>
                </div>
              </div>
            </dl>
            <p className="mt-8 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-400 dark:border-slate-800 dark:text-slate-500">
              Le numéro de téléphone est votre identifiant de connexion unique. Pour toute modification, veuillez contacter le support technique.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
