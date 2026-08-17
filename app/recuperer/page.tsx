import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, roleHome } from "@/lib/auth";
import { requestPinResetAction } from "@/app/actions";
import { displayPhone } from "@/lib/format";

export const metadata = {
  title: "Récupération du code — Sigma Events",
};

const ERRORS: Record<string, string> = {
  invalid: "Numéro invalide. Vérifiez votre saisie.",
  rate_limited: "Trop de demandes. Réessayez dans quelques minutes.",
  not_found: "Aucun compte récupérable avec ce numéro. Vérifiez votre saisie.",
};

// Label façon SIGMA EVENTS : mono, majuscule, espacé.
const labelCls = "mb-1.5 block font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400";

export default async function RecoverPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const err = sp.err ?? null;
  const phone = sp.phone ?? "";

  const user = await getCurrentUser();
  if (user) redirect(roleHome(user.role));

  return (
    <main className="dark relative flex min-h-screen flex-col overflow-hidden bg-slate-950">
      {/* Fond : grille discrète + halos (même langage que le héro de l'accueil) */}
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

      {/* Barre supérieure : marque texte + bascule vers la connexion */}
      <header className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Accueil"
          className="font-display text-xl font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90"
        >
          Sigma <span className="text-brand-400">Events</span>
        </Link>
        <p className="text-sm text-slate-400">
          Vous vous souvenez de votre code ?{" "}
          <Link href="/login" className="font-bold text-brand-400 transition hover:text-brand-300">
            Se connecter
          </Link>
        </p>
      </header>

      {/* Zone centrale */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">
        <div className="animate-fade-up w-full max-w-lg">
          {/* Accent line + titre de page (design pro) */}
          <div className="mb-5 h-1 w-10 rounded-full bg-brand-500" />
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white">
            Code oublié
          </h1>
          <p className="mt-2 mb-8 text-sm leading-relaxed text-slate-400">
            Entrez votre numéro : nous vous enverrons un code par SMS pour réinitialiser votre code personnel.
          </p>

          {/* Carte avec halo dégradé */}
          <div className="relative">
            <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-brand-600/25 to-emerald-500/15 blur-2xl" />
            {/* Carte en verre : fond translucide qui laisse transparaître le background */}
            <div className="relative rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
              {err && ERRORS[err] && (
                <div role="alert" className="animate-fade-up mb-5 flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
                  <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                  <p className="font-semibold">{ERRORS[err]}</p>
                </div>
              )}

              <form action={requestPinResetAction} className="space-y-4">
                {/* Progression façon SIGMA EVENTS : segments + ÉTAPE 1 / 2 (cohérent
                    avec « Étape 2 / 2 » de la page de vérification) */}
                <div>
                  <div className="mb-2 flex gap-1.5">
                    {[1, 2].map((s) => (
                      <div key={s} className={`h-1 flex-1 rounded-full ${s <= 1 ? "bg-brand-500" : "bg-slate-200 dark:bg-slate-700"}`} />
                    ))}
                  </div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    Étape 1 / 2 · Votre numéro
                  </p>
                </div>

                <div>
                  <label htmlFor="recover-phone" className={labelCls}>
                    Numéro de téléphone
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500">
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                    </span>
                    <input
                      id="recover-phone"
                      name="phone"
                      type="tel"
                      required
                      autoComplete="tel"
                      inputMode="tel"
                      defaultValue={phone}
                      placeholder="97 00 00 00"
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-brand-500 dark:focus:bg-slate-900"
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-400">Ajoutez l&#39;indicatif de votre pays — nous enverrons un code de vérification</p>
                </div>

                <button
                  type="submit"
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3.5 font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
                >
                  Recevoir le code
                  <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
                </button>
              </form>

              <p className="mt-5 border-t border-slate-100 pt-4 text-center text-[11px] leading-relaxed text-slate-400 dark:border-slate-800 dark:text-slate-500">
                Connexion sécurisée — vos données restent protégées.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
