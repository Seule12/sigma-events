import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, roleHome } from "@/lib/auth";
import VerifyForm from "@/components/verify-form";

export const metadata = {
  title: "Vérification — Sigma Events",
};

// Page de vérification de l'inscription — design pro : top bar avec marque texte,
// accent line, titre Barlow Condensed, carte centrée avec halo. Le formulaire
// (OTP + code personnel) est géré par VerifyForm avec sa progression à segments.
export default async function VerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const phone = sp.phone ?? "";
  const name = sp.name ? decodeURIComponent(sp.name) : "";
  const err = sp.err ?? null;

  const user = await getCurrentUser();
  if (user) redirect(roleHome(user.role));
  if (!phone || !name) redirect("/register");

  return (
    <main className="dark relative flex min-h-screen flex-col overflow-hidden bg-slate-950">
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

      {/* Barre supérieure : marque texte + retour */}
      <header className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          aria-label="Accueil"
          className="font-display text-xl font-bold uppercase tracking-[0.06em] text-white transition hover:opacity-90"
        >
          Sigma <span className="text-brand-400">Events</span>
        </Link>
        <p className="text-sm text-slate-400">
          Mauvais numéro ?{" "}
          <Link href="/register" className="font-bold text-brand-400 transition hover:text-brand-300">
            Recommencer
          </Link>
        </p>
      </header>

      {/* Zone centrale */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">
          {/* Formulaire sans carte : fond identique au register/login */}
          <div className="animate-fade-up w-full max-w-lg">
            <div className="mb-5 flex items-center gap-3">
              <div className="h-1 w-10 rounded-full bg-gradient-to-r from-brand-500 to-emerald-400" />
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Vérification du compte</p>
            </div>
            <h1 className="font-display text-4xl font-extrabold tracking-tight text-white">
              Vérification
            </h1>
            <p className="mt-2 mb-8 text-sm leading-relaxed text-slate-400">
              Dernière étape : validez votre compte avec le code reçu par SMS, puis choisissez votre code personnel.
            </p>
            <VerifyForm phone={phone} name={name} err={err} />
          </div>
      </div>
    </main>
  );
}
