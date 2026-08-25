import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/app/generated/prisma/enums";
import Sidebar from "@/components/sidebar";
import ContactForm from "@/components/contact-form";

export const metadata = {
  title: "Aide & Support — Sigma Events",
};

const ORGANIZER_GUIDE = [
  {
    title: "1. Créer votre compte",
    body: "Inscrivez-vous avec votre numéro de téléphone (validez le code reçu par SMS) ou avec Google. Votre code personnel (PIN) à 4 chiffres protège votre espace : ne le partagez jamais.",
  },
  {
    title: "2. Créer votre événement",
    body: "Depuis votre tableau de bord, cliquez sur « Créer un événement ». Renseignez le nom, la date, le lieu et une belle image de couverture. Vous pouvez choisir une image proposée automatiquement selon le type d'événement (concert, conférence, sport…).",
  },
  {
    title: "3. Configurer la billetterie",
    body: "Définissez vos catégories de billets (VIP, standard…), les prix et les quantités. Dès que l'événement est annoncé, votre lien de boutique est généré : partagez-le sur vos réseaux, vos invités achètent en ligne en quelques secondes.",
  },
  {
    title: "4. Importer vos invités",
    body: "Utilisez « Invitations privées » pour importer une liste (fichier CSV) ou ajouter vos invités manuellement. Chacun reçoit un billet avec un QR code unique par SMS ou par lien.",
  },
  {
    title: "5. Créer vos portes (terminaux)",
    body: "Dans la gestion de l'événement, créez une porte par point de contrôle (Entrée principale, VIP, Backstage…). Chaque porte reçoit un identifiant permanent (ex : T-9281) que vous communiquez à l'agent qui tient le scanner.",
  },
  {
    title: "6. Contrôler les entrées",
    body: "L'agent installe SIGMA Scanner sur son téléphone, active le terminal avec l'identifiant de la porte, puis scanne chaque billet. La validation est instantanée : valide, déjà utilisé, invalide, trop tôt. Le scanner fonctionne même sans réseau et synchronise les scans dès qu'il se reconnecte.",
  },
  {
    title: "7. Suivre vos ventes et entrées",
    body: "Le tableau de bord affiche en temps réel les billets vendus, les entrées validées par porte, et l'état de vos caisses. Vous pouvez aussi exporter vos billets et les statistiques à tout moment.",
  },
  {
    title: "8. Retirer votre argent",
    body: "Vos ventes sont versées sur votre solde organisateur. Demandez un retrait quand vous voulez : les fonds sont transférés sur votre compte mobile money via notre partenaire de paiement. La commission Sigma (3 % par billet vendu) est prélevée automatiquement.",
  },
];

const AGENT_GUIDE = [
  {
    title: "1. Installer l'application",
    body: "Téléchargez SIGMA Scanner (Android) et installez le fichier APK sur le téléphone de l'agent. Autorisez l'accès à la caméra pour le scan des QR codes.",
  },
  {
    title: "2. Activer le terminal",
    body: "L'organisateur vous communique l'identifiant de la porte (ex : T-9281) ainsi qu'un numéro de téléphone et un code. Saisissez ces informations dans l'écran d'activation : le terminal est alors lié à votre téléphone et prêt à scanner.",
  },
  {
    title: "3. Scanner les billets",
    body: "Pointez la caméra sur le QR code du billet. L'écran affiche la décision : billet valide (entrée acceptée), déjà utilisé (refusé), inconnu (refusé) ou trop tôt. La validation temps réel est faite par le serveur quand le réseau est disponible.",
  },
  {
    title: "4. Mode hors-ligne",
    body: "Si la connexion est coupée, le scanner continue de fonctionner : les scans sont enregistrés sur le téléphone et synchronisés automatiquement dès que le réseau revient. Aucune entrée ne peut être doublée grâce à la protection anti double-scan.",
  },
  {
    title: "5. Bonnes pratiques",
    body: "Gardez l'écran allumé et la batterie chargée, vérifiez la synchronisation après chaque affluence, et signalez immédiatement à l'organisateur tout téléphone perdu pour révoquer le terminal.",
  },
];

const FAQS = [
  {
    question: "Comment modifier mon code personnel (PIN) ?",
    answer: "Vous pouvez modifier votre code PIN dans la section « Mon Profil ». Allez dans l'onglet sécurité, saisissez votre code actuel, puis définissez-en un nouveau de 4 chiffres.",
  },
  {
    question: "Où trouver mes liens de boutique ?",
    answer: "Rendez-vous dans la gestion de votre événement. Le lien de vente est généré automatiquement dès que vous passez l'événement en statut « Annoncé ». Partagez-le pour commencer à vendre.",
  },
  {
    question: "Quelle est la commission Sigma Events ?",
    answer: "Sigma Events prélève une commission fixe de 3 % sur chaque billet vendu via la plateforme. Elle couvre les frais de transaction et la maintenance du service. Le reste vous est reversé lors de vos retraits.",
  },
  {
    question: "Comment se fait l'activation du scanner ?",
    answer: "Créez une porte dans votre événement : elle reçoit un identifiant permanent (ex : T-9281). Communiquez cet identifiant à votre agent, qui le saisit dans SIGMA Scanner avec le téléphone et le code fournis. Aucun code temporaire n'est nécessaire.",
  },
  {
    question: "Comment retirer l'argent de mes ventes ?",
    answer: "Dans votre tableau de bord, ouvrez la section retraits, indiquez le montant et votre compte mobile money. Le transfert est traité par notre partenaire FedaPay, généralement en quelques minutes.",
  },
  {
    question: "Comment importer mes invités ?",
    answer: "Dans la page de gestion de l'événement, utilisez l'option « Invitations privées ». Vous pouvez importer une liste (fichier CSV) ou ajouter vos invités manuellement.",
  },
  {
    question: "Que se passe-t-il si un billet est scanné deux fois ?",
    answer: "Le deuxième scan est refusé : chaque billet n'est valable qu'une seule fois, même hors-ligne. Le journal des entrées garde la trace de chaque scan pour vous protéger des fraudes.",
  },
  {
    question: "L'événement est annulé ou reporté, que faire ?",
    answer: "Contactez le support : nous pouvons reporter la date de l'événement (les billets restent valables) ou organiser le remboursement des billets non utilisés selon votre politique.",
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
      <Sidebar events={sidebarEvents} userName={user.name} />

      <div className="lg:pl-[var(--sidebar-w)]">
        <main className="mx-auto max-w-4xl px-4 py-10 pt-24 sm:px-6 lg:pt-12">
          <div className="mb-10 text-center">
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
              Centre d&apos;Assistance
            </h1>
            <p className="mt-3 text-lg text-slate-500 dark:text-slate-400">
              Guides pas à pas, questions fréquentes et support — tout pour réussir vos événements.
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
              <div className="absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-emerald-500/10 blur-2xl transition-all group-hover:bg-emerald-500/20" />
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
              <div className="absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-blue-500/10 blur-2xl transition-all group-hover:bg-blue-500/20" />
            </a>

            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition dark:border-slate-800 dark:bg-slate-900">
              <div className="relative z-10">
                <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 0c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white">Centre d&apos;aide</h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Guides et FAQ ci-dessous.</p>
              </div>
              <div className="absolute -right-4 -bottom-4 h-24 w-24 rounded-full bg-brand-500/10 blur-2xl" />
            </div>
          </div>

          {/* Guide organisateur */}
          <section className="mb-10 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-8">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /></svg>
                Guide organisateur
              </div>
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                De la création à l&apos;encaissement
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Suivez ces étapes dans l&apos;ordre pour organiser un événement de bout en bout.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {ORGANIZER_GUIDE.map((step, i) => (
                <details key={i} className="group rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800">
                  <summary className="flex cursor-pointer items-center justify-between font-bold text-slate-700 dark:text-slate-200">
                    <span className="text-sm">{step.title}</span>
                    <span className="transition group-open:rotate-180">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {step.body}
                  </p>
                </details>
              ))}
            </div>
          </section>

          {/* Guide agent */}
          <section className="mb-10 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-8">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-6l-2-2H5a2 2 0 0 0-2 2z" /><path d="M9 14l2 2 4-4" /></svg>
                Guide agent de contrôle
              </div>
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Prendre en main SIGMA Scanner
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                À transmettre aux agents qui tiennent les portes le jour J.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-4">
              {AGENT_GUIDE.map((step, i) => (
                <details key={i} className="group rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800/50 dark:hover:bg-slate-800">
                  <summary className="flex cursor-pointer items-center justify-between font-bold text-slate-700 dark:text-slate-200">
                    <span className="text-sm">{step.title}</span>
                    <span className="transition group-open:rotate-180">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                    {step.body}
                  </p>
                </details>
              ))}
            </div>
          </section>

          {/* Formulaire de contact */}
          <section className="mb-10 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-6">
              <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Nous contacter</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Envoyez-nous un message et nous vous répondrons dans les plus brefs délais.
              </p>
            </div>
            <ContactForm />
          </section>

          {/* Section FAQ */}
          <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
          </section>
        </main>
      </div>
    </div>
  );
}
