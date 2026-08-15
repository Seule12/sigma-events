import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, roleHome } from "@/lib/auth";
import { MOMO_NETWORKS } from "@/lib/momo";

export const metadata = {
  title: "Sigma Events",
  description:
    "Vendez vos billets en ligne par mobile money, gérez vos invitations privées, contrôlez l'accès avec des QR codes sécurisés et suivez votre chiffre d'affaires en temps réel.",
};

const FEATURES = [
  {
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
    ),
    title: "Boutique en ligne",
    desc: "Un lien par événement, partagé sur WhatsApp : vos clients choisissent leur billet et le montant se calcule tout seul.",
  },
  {
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2" /><path d="M6 12h.01M18 12h.01" /></svg>
    ),
    title: "Paiement mobile money",
    desc: "MTN MoMo, Moov Money et Celtiis Cash : vos clients paient depuis leur téléphone.",
  },
  {
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M13 5v2M13 17v2M13 11v2" /></svg>
    ),
    title: "Billets QR sécurisés",
    desc: "Chaque billet reçoit un QR unique et infalsifiable, envoyé sur WhatsApp ou par email après le paiement.",
  },
  {
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M9 5v2M9 17v2" /></svg>
    ),
    title: "Invitations privées & « +1 »",
    desc: "Mariage, cérémonie, réception : créez votre liste d'invités et envoyez des invitations nominatives avec QR. Chaque invitation autorise plusieurs personnes — l'agent enregistre les entrées une à une jusqu'à consommation complète.",
  },
  {
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" /></svg>
    ),
    title: "Contrôle d'accès agents",
    desc: "Vos agents scannent les QR avec leur téléphone, même sans réseau. Refus automatique des doublons et falsifications.",
  },
  {
    icon: (
      <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M18 17V9M13 17V5M8 17v-3" /></svg>
    ),
    title: "Jauge, alertes & chiffre d'affaires",
    desc: "Suivez la capacité en temps réel avec alertes automatiques à 80 %, 90 % et 100 %. Ventes, frais de livraison et commission Sigma détaillés par événement, avec l'évolution du CA sur 14 jours.",
  },
];

const STEPS = [
  {
    n: "1",
    title: "Créez votre événement",
    desc: "Nom, lieu, date, capacité et vos types de billets avec leurs prix en FCFA. Un lien de vente est généré automatiquement.",
  },
  {
    n: "2",
    title: "Partagez le lien",
    desc: "Envoyez-le sur WhatsApp ou vos réseaux. Vos clients paient par mobile money et reçoivent leur billet QR immédiatement.",
  },
  {
    n: "3",
    title: "Scannez à l'entrée",
    desc: "Vos agents valident les billets et les invitations en un scan. La jauge, les alertes et votre chiffre d'affaires se mettent à jour en direct.",
  },
];

// Questions fréquentes (FAQ) — réponses aux objections principales : paiement,
// fonctionnement hors-ligne, commission, billets QR, invitations.
const FAQ = [
  {
    q: "Comment mes clients paient-ils leurs billets ?",
    a: "Par mobile money directement depuis leur téléphone — MTN MoMo (*880#), Moov Money (*855#) ou Celtiis Cash (*899#) — sans carte bancaire. Le paiement est confirmé en quelques secondes et le billet QR est émis automatiquement.",
  },
  {
    q: "Le contrôle d'accès fonctionne-t-il sans internet ?",
    a: "Oui. Vos agents scannent les QR avec l'app SIGMA Scanner même hors-ligne : les entrées sont enregistrées localement puis synchronisées dès que le réseau revient. Le refus des doublons et des falsifications est immédiat, même sans connexion.",
  },
  {
    q: "Combien ça coûte ?",
    a: "Rien à l'avance : le compte, les événements, les billets QR et le contrôle d'accès sont gratuits. Sigma ne gagne que lorsque vous vendez — une commission de 2,5 % sur chaque billet payant (ex. 125 F sur un billet à 5 000 F).",
  },
  {
    q: "Un billet peut-il être dupliqué ou falsifié ?",
    a: "Non. Chaque billet porte un QR unique généré cryptographiquement. Le scanner vérifie le billet en temps réel : une seconde présentation du même QR est refusée automatiquement, ainsi que tout billet inconnu ou en liste noire.",
  },
  {
    q: "Puis-je gérer des invitations privées (mariage, cérémonie) ?",
    a: "Oui — c'est même le cœur du système. Importez votre liste d'invités (manuellement ou en CSV), envoyez des invitations nominatives avec QR par WhatsApp, SMS ou email, et suivez chaque statut : envoyée, ouverte, confirmée, entrée. Le « +1 » est contrôlé entrée par entrée.",
  },
  {
    q: "Comment mes invités reçoivent-ils leur billet ?",
    a: "Immédiatement après le paiement, au choix du client : téléchargement direct, envoi par email ou sur WhatsApp. Le billet est aussi retrouvable à tout moment via « Retrouver mon billet ».",
  },
];

// Faux QR décoratif pour la maquette du héro (motif statique, non scannable).
function DecorQr({ className = "" }: { className?: string }) {
  const cells = [
    [0, 0], [1, 0], [2, 0], [3, 0],
    [0, 1], [3, 1],
    [0, 2], [3, 2],
    [0, 3], [1, 3], [2, 3], [3, 3],
    [7, 0], [8, 0], [9, 0], [10, 0],
    [7, 1], [10, 1],
    [7, 2], [10, 2],
    [7, 3], [8, 3], [9, 3], [10, 3],
    [0, 7], [0, 8], [0, 9], [0, 10],
    [1, 7], [1, 10],
    [2, 7], [2, 10],
    [3, 7], [3, 8], [3, 9], [3, 10],
    [5, 5], [5, 6], [6, 5], [6, 6], [6, 7], [7, 7], [7, 6],
    [8, 8], [9, 9], [10, 10], [10, 8], [8, 10], [9, 7], [7, 9],
    [2, 5], [3, 6], [1, 8], [5, 9], [9, 4], [4, 9], [10, 4], [4, 10],
    [12, 12], [12, 13], [13, 12], [13, 13], [14, 12], [12, 14],
    [15, 15], [16, 15], [15, 16], [16, 16], [17, 17], [18, 18], [19, 19],
  ];
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <rect width="20" height="20" fill="white" rx="1.5" />
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x + 0.15} y={y + 0.15} width="0.85" height="0.85" fill="#0f172a" />
      ))}
    </svg>
  );
}

// Maquette produit du héro : billet QR + toasts de notifications flottants.
function HeroMockup({ className = "" }: { className?: string }) {
  return (
    <div className={`relative mx-auto mt-12 w-full max-w-sm ${className}`} aria-hidden="true">
      {/* Toast : paiement reçu */}
      <div className="animate-float absolute -left-3 -top-6 z-20 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur sm:-left-10">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-emerald-400">
          <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </span>
        <div>
          <p className="text-xs font-bold text-white">Paiement reçu · 15 000 F</p>
          <p className="text-[11px] text-slate-400">Aya · MTN MoMo</p>
        </div>
      </div>

      {/* Billet */}
      <div className="animate-float-slow relative z-10 mx-auto w-[88%] overflow-hidden rounded-2xl bg-white text-slate-900 shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-slate-200 bg-gradient-to-r from-brand-600 to-brand-700 px-5 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-100">Billet électronique</p>
            <p className="mt-0.5 text-base font-extrabold text-white">Vodoun Night</p>
          </div>
          <span className="rounded-lg bg-white/15 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white">VIP</span>
        </div>
        <div className="flex items-center gap-4 px-5 py-4">
          <DecorQr className="h-20 w-20 shrink-0 rounded-lg ring-1 ring-slate-200" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="truncate text-sm font-bold">SIG-839281 · Aya Nouantin</p>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Sam 12 sept · 18 h 00
              <br />
              Palais des Congrès
            </p>
            <p className="text-xs font-extrabold text-brand-600">15 000 FCFA</p>
          </div>
        </div>
        <div className="border-t border-dashed border-slate-200 px-5 py-2.5">
          <div className="h-3 w-full rounded-full bg-[repeating-linear-gradient(90deg,#0f172a_0,#0f172a_2px,transparent_2px,transparent_5px)] opacity-60" />
        </div>
      </div>

      {/* Toast : entrée validée */}
      <div className="animate-float-delay absolute -bottom-5 -right-2 z-20 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 shadow-2xl shadow-black/40 backdrop-blur sm:-right-8">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500/20 text-brand-400">
          <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M13 5v2M13 17v2M13 11v2" /></svg>
        </span>
        <div>
          <p className="text-xs font-bold text-white">Entrée validée · Agent 2</p>
          <p className="text-[11px] text-slate-400">QR scanné en 0,4 s</p>
        </div>
      </div>

      {/* Halo décoratif */}
      <div className="absolute left-1/2 top-1/2 -z-10 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-600/25 blur-3xl" />
    </div>
  );
}

export default async function Home() {
  const user = await getCurrentUser();
  if (user) redirect(roleHome(user.role));

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-white">
      {/* ===== Navigation ===== */}
      <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="font-display text-lg font-bold uppercase tracking-[0.06em] text-slate-900 transition hover:opacity-90 dark:text-white">
            Sigma <span className="text-brand-600 dark:text-brand-400">Events</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex dark:text-slate-300">
            <a href="#fonctionnalites" className="transition hover:text-brand-600 dark:hover:text-brand-400">Fonctionnalités</a>
            <a href="#mobile-money" className="transition hover:text-brand-600 dark:hover:text-brand-400">Mobile money</a>
            <a href="#comment-ca-marche" className="transition hover:text-brand-600 dark:hover:text-brand-400">Comment ça marche</a>
            <a href="#tarifs" className="transition hover:text-brand-600 dark:hover:text-brand-400">Tarifs</a>
            <a href="#faq" className="transition hover:text-brand-600 dark:hover:text-brand-400">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:text-slate-300"
            >
              Se connecter
            </Link>
            <Link
              href="/register"
              className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5"
            >
              Créer un compte
            </Link>
          </div>
        </div>
      </header>

      {/* ===== Héro : présentation à gauche, maquette produit à droite ===== */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        {/* Fond : grille discrète + halos */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgb(255 255 255 / 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.04) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[60rem] -translate-x-1/2 rounded-full bg-brand-600/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-32 h-96 w-96 rounded-full bg-emerald-500/10 blur-3xl" />

        <div className="relative mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-24">
          {/* Colonne gauche : présentation */}
          <div>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
<center>
              Organisez. Vendez. 
              <span className="bg-gradient-to-r from-brand-400 via-emerald-300 to-emerald-400 bg-clip-text text-transparent">
                 Contrôlez vos événements.

              </span>
</center>
            </h1>
<center>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-slate-400">
              La plateforme qui simplifie toute votre chaîne événementielle : billetterie
              par mobile money, invitations privées avec QR nominatif, contrôle d&apos;accès
              par vos agents.
            </p>
</center>
            

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/register"
                className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-7 py-3.5 text-base font-bold text-white shadow-xl shadow-brand-600/40 transition hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-brand-600/50"
              >
                Créer mon compte gratuit
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </Link>
              <Link
                href="/login"
                className="rounded-2xl border border-white/15 px-7 py-3.5 text-base font-bold text-slate-200 transition hover:border-brand-500/60 hover:bg-white/5 hover:text-brand-300"
              >
                J&apos;ai déjà un compte
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs font-semibold text-slate-500">
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M9 5v2M9 17v2" /></svg>
                Invitations + QR nominatif
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                Le « +1 » contrôlé
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4 text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z" /></svg>
                Envoi WhatsApp / Email
              </span>
            </div>

          </div>

          {/* Colonne droite : maquette produit (tous écrans) */}
          <div className="mx-auto w-full max-w-md">
            <HeroMockup />
          </div>
        </div>
      </section>

      {/* ===== Réseaux mobile money ===== */}
      <section id="mobile-money" className="border-y border-slate-100 bg-slate-50 py-16 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-xl text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
              Paiement par mobile money
            </p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Vos clients paient en quelques secondes avec le réseau qu&apos;ils utilisent déjà.
            </p>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
            {MOMO_NETWORKS.map((n) => (
              <div
                key={n.id}
                className="group rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-xl dark:border-slate-700 dark:bg-slate-900"
              >
                <div className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${n.dot} text-[10px] font-extrabold uppercase leading-tight text-white shadow-md transition group-hover:scale-110 ${n.id === "MTN_MOMO" ? "text-yellow-950" : ""}`}>
                  {n.short}
                </div>
                <p className="mt-3 text-sm font-extrabold text-slate-900 dark:text-white">{n.name}</p>
                <p className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold ${n.badge}`}>{n.ussd}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Fonctionnalités ===== */}
      <section id="fonctionnalites" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Tout ce qu&apos;il faut pour organiser, vendre et contrôler
          </h2>
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            De la création de l&apos;événement au rapport final, Sigma Security couvre toute la chaîne — sur mobile.
          </p>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-800"
            >
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-brand-50 to-emerald-50 text-brand-600 transition group-hover:scale-110 group-hover:from-brand-600 group-hover:to-brand-700 group-hover:text-white dark:from-brand-950 dark:to-slate-800 dark:text-brand-400">
                {f.icon}
              </div>
              <h3 className="mt-4 text-base font-extrabold text-slate-900 dark:text-white">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Comment ça marche ===== */}
      <section id="comment-ca-marche" className="bg-slate-950 py-24 text-white">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Prêt en 3 étapes</h2>
          <p className="mt-4 text-sm text-slate-400">
            Aucune installation. Tout se passe dans le navigateur et sur WhatsApp.
          </p>
        </div>
          <div className="relative mt-14 grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="pointer-events-none absolute left-0 right-0 top-8 hidden h-px bg-gradient-to-r from-transparent via-brand-500/40 to-transparent md:block" />
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-3xl border border-slate-800 bg-slate-900/60 p-7 backdrop-blur transition hover:border-brand-700/60">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-extrabold text-white shadow-lg shadow-brand-600/30">
                  {s.n}
                </div>
                <h3 className="mt-5 text-lg font-extrabold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Tarifs ===== */}
      <section id="tarifs" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Une tarification transparente</h2>
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
            Sigma est <b className="text-slate-700 dark:text-slate-300">gratuit à l&apos;usage</b> : vous ne payez que lorsque vous vendez.
          </p>
        </div>
        <div className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Gratuit</p>
            <p className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-white">0 FCFA</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li className="flex items-start gap-2"><span className="text-emerald-500">✓</span> Création de compte et d&apos;événements</li>
              <li className="flex items-start gap-2"><span className="text-emerald-500">✓</span> Billets &amp; invitations QR illimités</li>
              <li className="flex items-start gap-2"><span className="text-emerald-500">✓</span> Contrôle d&apos;accès agents</li>
              <li className="flex items-start gap-2"><span className="text-emerald-500">✓</span> Jauge, statistiques et rapports</li>
            </ul>
          </div>
          <div className="relative rounded-3xl border-2 border-brand-600 bg-gradient-to-br from-brand-700 to-brand-900 p-7 text-white shadow-2xl shadow-brand-600/30">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-4 py-1 text-[11px] font-extrabold uppercase tracking-widest text-white">
              À la vente
            </span>
            <p className="text-xs font-bold uppercase tracking-widest text-brand-200">Commission Sigma</p>
            <p className="mt-3 text-2xl font-extrabold">3 %</p>
            <p className="mt-1 text-sm text-brand-100">sur chaque billet vendu</p>
            <ul className="mt-4 space-y-2 text-sm text-brand-100">
              <li className="flex items-start gap-2"><span>✓</span> Rien à payer d&apos;avance</li>
              <li className="flex items-start gap-2"><span>✓</span> Reversement détaillé sur votre profil</li>
              <li className="flex items-start gap-2"><span>✓</span> Taux personnalisable selon votre volume</li>
            </ul>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-7 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-bold uppercase tracking-widest text-sky-600 dark:text-sky-400">Livraison du billet</p>
            <p className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-white">Au choix du client</p>
            <ul className="mt-4 space-y-2 text-sm text-slate-500 dark:text-slate-400">
              <li className="flex items-start gap-2"><span className="text-sky-500">✓</span> Téléchargement direct</li>
              <li className="flex items-start gap-2"><span className="text-sky-500">✓</span> Par email</li>
              <li className="flex items-start gap-2"><span className="text-sky-500">✓</span> Sur WhatsApp</li>
            </ul>
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="border-t border-slate-100 bg-slate-50 py-24 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Questions fréquentes</h2>
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
              Tout ce qu&apos;il faut savoir avant de lancer votre premier événement.
            </p>
          </div>
          <div className="mt-12 space-y-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-brand-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-brand-800"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4.5 text-sm font-bold text-slate-900 dark:text-white">
                  {item.q}
                  <svg
                    className="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </summary>
                <p className="px-6 pb-5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA final ===== */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-800 to-slate-900 px-8 py-14 text-center text-white sm:px-14">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-emerald-400/20 blur-2xl" />
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Votre prochain événement mérite mieux qu&apos;une liste d&apos;invités papier.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm text-brand-100">
            Créez votre compte en 30 secondes, générez votre lien de vente et lancez votre billetterie aujourd&apos;hui.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/register"
              className="rounded-2xl bg-white px-7 py-3.5 text-base font-bold text-brand-800 shadow-xl transition hover:-translate-y-0.5"
            >
              Créer mon compte gratuit
            </Link>
            <Link
              href="/login"
              className="rounded-2xl border border-white/30 px-7 py-3.5 text-base font-bold text-white transition hover:bg-white/10"
            >
              J&apos;ai déjà un compte
            </Link>
          </div>
        </div>
      </section>

      {/* ===== Footer ===== */}
      <footer className="border-t border-slate-800 bg-slate-950 py-12 text-slate-300">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 text-center sm:px-6">
          <span className="font-display text-base font-bold uppercase tracking-[0.06em] text-white">
            Sigma <span className="text-brand-400">Events</span>
          </span>
          <p className="max-w-md text-xs leading-relaxed text-slate-400">
            Billetterie numérique, invitations privées &amp; contrôle d&apos;accès événementiel.
            <br />
            Paiements : MTN MoMo · Moov Money · Celtiis Cash.
          </p>
          <div className="flex items-center gap-5 text-xs font-semibold text-slate-400">
            <Link href="/login" className="transition hover:text-brand-400">Se connecter</Link>
            <Link href="/register" className="transition hover:text-brand-400">Créer un compte</Link>
            <Link href="/mon-billet" className="transition hover:text-brand-400">Retrouver mon billet</Link>
          </div>
          <p className="text-[11px] text-slate-500">© {new Date().getFullYear()} Sigma Security</p>
        </div>
      </footer>
    </div>
  );
}
