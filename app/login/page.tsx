import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, roleHome } from "@/lib/auth";
import { OAUTH_PROVIDERS } from "@/lib/oauth";
import AuthPanel from "@/components/auth-panel";
import FakeQr from "@/components/fake-qr";

export const metadata = {
  title: "Se connecter — Sigma Events",
};

// Points forts affichés dans la vitrine (grands écrans).
const HIGHLIGHTS = [
  {
    title: "Billets QR sécurisés",
    desc: "Signature cryptographique : impossible à dupliquer.",
    icon: (
      <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></svg>
    ),
  },
  {
    title: "Paiement mobile money",
    desc: "MTN · Moov · Celtiis Cash — vos clients paient au téléphone.",
    icon: (
      <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="7" y="2" width="10" height="20" rx="2" /><path d="M11 18h2" /></svg>
    ),
  },
  {
    title: "Contrôle en temps réel",
    desc: "Synchronisation instantanée entre tous vos agents.",
    icon: (
      <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
    ),
  },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ oauth?: string; provider?: string; error?: string; reset?: string }>;
}) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (user) redirect(roleHome(user.role));

  // Fournisseurs de connexion sociale configurés (présents dans .env).
  const socialEnabled = (Object.keys(OAUTH_PROVIDERS) as (keyof typeof OAUTH_PROVIDERS)[]).filter(
    (k) => OAUTH_PROVIDERS[k].enabled
  );

  // Message de retour du flux OAuth (refus, erreur, compte bloqué).
  const oauthMessage =
    sp.oauth === "denied"
      ? `Connexion ${sp.provider ?? "sociale"} annulée — aucune modification apportée.`
      : sp.oauth === "blocked"
        ? "Ce compte a été bloqué par l'administration. Contactez le support."
        : sp.oauth === "error"
          ? `La connexion ${sp.provider ?? "sociale"} a échoué. Réessayez ou utilisez votre téléphone.`
          : null;

  // Message d'erreur du formulaire de connexion (numéro ou code incorrect).
  const loginError =
    sp.error === "1"
      ? "Numéro de téléphone ou code personnel incorrect."
      : sp.error === "2"
        ? "Trop de tentatives. Réessayez dans quelques minutes."
        : null;

  // Message de succès (ex : code personnel réinitialisé après récupération).
  const successMessage = sp.reset === "1" ? "Code personnel réinitialisé. Connectez-vous avec votre nouveau code." : null;

  // Le fond de la page est sombre par design : la classe `dark` force le mode
  // sombre (variantes dark: des champs et textes) pour rester cohérent.
  return (
    <main className="dark relative flex min-h-screen flex-col overflow-hidden bg-slate-950">
      {/* Liseré néon en haut de page */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 h-px bg-gradient-to-r from-transparent via-brand-500/70 to-transparent" />

      {/* Fond : grille masquée en douceur + halos aurora + vignette */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(255 255 255 / 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.04) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(ellipse 75% 65% at 50% 35%, black 35%, transparent 78%)",
          WebkitMaskImage: "radial-gradient(ellipse 75% 65% at 50% 35%, black 35%, transparent 78%)",
        }}
      />
      <div className="pointer-events-none absolute -top-44 left-1/4 h-[30rem] w-[30rem] rounded-full bg-brand-600/25 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-36 -right-16 h-[26rem] w-[26rem] rounded-full bg-emerald-500/15 blur-3xl" />
      <div className="pointer-events-none absolute top-1/3 -left-28 h-80 w-80 rounded-full bg-teal-500/10 blur-3xl" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(2,6,23,0.55)_100%)]" />

      {/* Barre supérieure : marque texte + bascule vers l'inscription */}
      <header className="relative z-20 mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Accueil"
          className="font-display text-xl font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90"
        >
          Sigma <span className="text-brand-400">Events</span>
        </Link>
        <p className="text-sm text-slate-400">
          Pas encore de compte ?{" "}
          <Link href="/register" className="font-bold text-brand-400 transition hover:text-brand-300">
            Inscription
          </Link>
        </p>
      </header>

      {/* Zone centrale : vitrine produit à gauche, formulaire à droite */}
      <div className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 items-center gap-12 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:gap-16">
        {/* Vitrine marque (grands écrans uniquement) */}
        <section className="hidden lg:block">
          <p className="mb-6 font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-brand-400">
            Billetterie · Contrôle d&apos;accès
          </p>
          <h1 className="font-display text-5xl font-extrabold leading-[1.04] tracking-tight text-white">
            Vos événements,
            <br />
            <span className="text-brand-400">contrôlés en un scan.</span>
          </h1>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-slate-400">
            Vendez vos billets en mobile money, protégez-les par QR et contrôlez les entrées en temps réel — depuis votre téléphone.
          </p>

          <ul className="mt-9 space-y-4">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex items-start gap-3.5">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-brand-400 backdrop-blur-xl">
                  {h.icon}
                </span>
                <span>
                  <span className="block text-sm font-bold text-white">{h.title}</span>
                  <span className="block text-xs text-slate-400">{h.desc}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* Maquette produit décorative : billet + toast + stat */}
          <div className="relative mt-12 max-w-sm">
            <div className="animate-float relative overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-black/50 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-brand-400">
                    Billet électronique
                  </p>
                  <p className="mt-1 truncate text-sm font-bold text-white">Gbediga — Vodoun Night</p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-400">
                    Aya Hounkpatin · <span className="text-slate-300">SIG-839281</span>
                  </p>
                </div>
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-white p-1.5 shadow-inner">
                  <FakeQr className="h-full w-full text-slate-900" />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-slate-300">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-400" />
                Accès validé · entrée principale
              </div>
            </div>

            <div className="animate-float-delay absolute -right-4 -top-3 flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-bold text-emerald-300 shadow-lg backdrop-blur-xl">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              Entrée validée
            </div>

            <div className="animate-float-slow absolute -left-5 bottom-4 rounded-xl border border-white/10 bg-slate-900/80 px-3.5 py-2.5 shadow-xl backdrop-blur-xl">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[0.18em] text-slate-500">Vendus ce soir</p>
              <p className="mt-0.5 text-lg font-extrabold text-white">
                12 480 <span className="text-sm font-bold text-brand-400">billets</span>
              </p>
            </div>
          </div>
        </section>

        {/* Formulaire — sans carte, directement sur le fond */}
        <section className="mx-auto w-full max-w-md lg:mx-0 lg:justify-self-end">
          <div className="animate-fade-up">
            <div className="mb-5 flex items-center gap-3">
              <div className="h-1 w-10 rounded-full bg-gradient-to-r from-brand-500 to-emerald-400" />
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Accès sécurisé</p>
            </div>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-white">Connexion</h1>
            <p className="mt-2 mb-8 text-sm leading-relaxed text-slate-400">
              Entrez votre numéro de téléphone et votre code personnel pour retrouver vos événements et vos ventes.
            </p>

            <AuthPanel
              initialTab="login"
              socialEnabled={socialEnabled}
              oauthMessage={oauthMessage}
              loginError={loginError}
              successMessage={successMessage}
              hideHeader
              hideTabs
            />

            {/* Accès agent */}
            <p className="mt-6 text-center font-mono text-xs text-slate-500">
              Vous êtes un agent ?{" "}
              <Link href="/scan" className="font-bold text-brand-400 transition hover:text-brand-300">
                Accéder au scanner →
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
