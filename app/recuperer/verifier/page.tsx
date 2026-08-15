import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, roleHome } from "@/lib/auth";
import ResetPinForm from "@/components/reset-pin-form";

export const metadata = {
  title: "Nouveau code — Sigma Events",
};

// Étape 2 de la récupération de code — design pro : top bar avec marque texte,
// accent line, titre Barlow Condensed, carte centrée avec halo. Le formulaire
// (OTP + nouveau code personnel) est géré par ResetPinForm.
export default async function RecoverVerifyPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const phone = sp.phone ?? "";
  const err = sp.err ?? null;

  const user = await getCurrentUser();
  if (user) redirect(roleHome(user.role));
  if (!phone) redirect("/recuperer");

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
          <Link href="/recuperer" className="font-bold text-brand-400 transition hover:text-brand-300">
            Recommencer
          </Link>
        </p>
      </header>

      {/* Zone centrale */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">
        <div className="animate-fade-up w-full max-w-lg">
          {/* Accent line + titre de page (design pro) */}
          <div className="mb-5 h-1 w-10 rounded-full bg-brand-500" />
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-white">
            Nouveau code personnel
          </h1>
          <p className="mt-2 mb-8 text-sm leading-relaxed text-slate-400">
            Saisissez le code reçu par SMS, puis choisissez votre nouveau code personnel.
          </p>

          {/* Carte avec halo dégradé */}
          <div className="relative">
            <div className="absolute -inset-3 rounded-[2rem] bg-gradient-to-br from-brand-600/25 to-emerald-500/15 blur-2xl" />
            {/* Carte en verre : fond translucide qui laisse transparaître le background */}
            <div className="relative rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
              <ResetPinForm phone={phone} err={err} />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
