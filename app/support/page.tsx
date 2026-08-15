import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/app/generated/prisma/enums";
import Sidebar from "@/components/sidebar";

export const metadata = {
  title: "Aide & Support — Sigma Security",
};

const FAQS = [
  {
    question: "Comment modifier mon code personnel (PIN) ?",
    answer: "Vous pouvez modifier votre code PIN dans la section 'Mon Profil'. Allez dans l'onglet sécurité, saisissez votre code actuel, puis définissez-en un nouveau de 4 chiffres.",
  },
  {
    question: "Où trouver mes liens de boutique ?",
    answer: "Rendez-vous dans la gestion de votre événement. Le lien de vente est généré automatiquement dès que vous passez l'événement en statut 'Annoncé' (LIVE).",
  },
  {
    question: "Qu'est-ce que la commission Sigma ?",
    answer: "Sigma Security prélève une commission fixe sur chaque billet vendu via notre plateforme pour couvrir les frais de transaction et la maintenance du service.",
  },
  {
    question: "Comment importer mes invités ?",
    answer: "Dans la page de gestion de l'événement, utilisez l'option 'Invitations privées'. Vous pourrez alors importer une liste ou ajouter vos invités manuellement.",
  },
];

export default async function SupportPage() {
  const user = await requireUser(Role.ORGANIZER);

  // Même liste d'événements que les autres pages du tableau de bord (nav latérale).
  const events = await prisma.event.findMany({
    where: { organizerId: user.id },
    orderBy: { date: "desc" },
    select: { id: true, name: true },
  });
  const sidebarEvents = events.map((e) => ({ id: e.id, name: e.name }));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar events={sidebarEvents} userName={user.name} isPro={user.profileType === "PRO"} />

      <div className="lg:pl-[var(--sidebar-w)]">
        <main className="mx-auto max-w-4xl px-4 py-10 pt-24 sm:px-6 lg:pt-12">
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              Centre d&apos;Assistance
            </h1>
            <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">
              Besoin d'aide ? Nous sommes là pour vous accompagner dans la réussite de vos événements.
            </p>
          </div>

          {/* Canaux de support rapide */}
          <div className="mb-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <a 
              href="https://wa.me/22900000000" 
              target="_blank" 
              rel="noopener noreferrer"
              className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="relative z-10">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">WhatsApp</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Réponse rapide et instantanée.</p>
              </div>
              <div className="absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl group-hover:bg-emerald-500/20 transition-all" />
            </a>

            <a 
              href="mailto:support@sigma-security.app"
              className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="relative z-10">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">Email</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pour les demandes détaillées.</p>
              </div>
              <div className="absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl group-hover:bg-blue-500/20 transition-all" />
            </a>

            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition dark:border-slate-800 dark:bg-slate-900">
              <div className="relative z-10">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 0c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">Centre d&apos;aide</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Consultez notre FAQ ci-dessous.</p>
              </div>
              <div className="absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-brand-500/10 blur-2xl" />
            </div>
          </div>

          {/* Section FAQ */}
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-8">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Questions Fréquentes</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Les réponses aux interrogations les plus courantes.</p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {FAQS.map((faq, i) => (
                <details key={i} className="group rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800">
                  <summary className="flex cursor-pointer items-center justify-between font-bold text-slate-700 dark:text-slate-200">
                    <span className="text-sm">{faq.question}</span>
                    <span className="transition group-open:rotate-180">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
