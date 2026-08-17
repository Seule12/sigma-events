"use client";

import { useState } from "react";
import { updateProfileAction, changePinAction } from "@/app/actions";

const PIN_ERRORS: Record<string, string> = {
  bad: "Votre code actuel est incorrect.",
  format: "Le nouveau code doit contenir exactement 4 chiffres.",
  mismatch: "Les deux codes ne correspondent pas.",
  same: "Le nouveau code doit être différent de l'actuel.",
  social: "Votre compte est lié à un fournisseur social : le code personnel n'est pas utilisé.",
  rate_limited: "Trop de tentatives. Réessayez dans quelques minutes.",
};

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-brand-500 dark:focus:bg-slate-900";

function EyeIcon({ off = false }: { off?: boolean }) {
  return off ? (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /></svg>
  ) : (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
  );
}

function SectionTitle({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="mb-5 flex items-start gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-lg shadow-brand-600/25">
        {icon}
      </span>
      <div>
        <h2 className="text-base font-extrabold tracking-tight text-slate-900 dark:text-white">{title}</h2>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{desc}</p>
      </div>
    </div>
  );
}

export default function SettingsForms({
  name,
  pinErr,
  profileErr,
}: {
  name: string;
  pinErr: string | null;
  profileErr: boolean;
}) {
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* ===== Profil ===== */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <SectionTitle
          icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
          title="Profil"
          desc="Vos informations d'identité."
        />

        <form action={updateProfileAction} className="space-y-4">
          {profileErr && (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              Le nom complet est obligatoire.
            </div>
          )}
          <div>
            <label htmlFor="st-name" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
              Nom complet
            </label>
            <input id="st-name" name="name" required defaultValue={name} className={inputCls} />
          </div>

          <button
            type="submit"
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
          >
            Enregistrer mes informations
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </button>
        </form>
      </section>

      {/* ===== Sécurité : code personnel ===== */}
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <SectionTitle
          icon={<svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>}
          title="Sécurité"
          desc="Changez votre code personnel à 4 chiffres."
        />

        <form action={changePinAction} className="space-y-4">
          {pinErr && (
            <div role="alert" className="animate-fade-up flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
              <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
              <p className="font-semibold">{PIN_ERRORS[pinErr] ?? "Impossible de modifier le code."}</p>
            </div>
          )}

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="st-current-pin" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Code actuel
              </label>
              <button
                type="button"
                onClick={() => setShowCurrentPin((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-bold text-brand-600 transition hover:text-brand-700 dark:text-brand-400"
              >
                <EyeIcon off={showCurrentPin} />
                {showCurrentPin ? "Masquer" : "Afficher"}
              </button>
            </div>
            <input
              id="st-current-pin"
              name="currentPin"
              type={showCurrentPin ? "text" : "password"}
              required
              inputMode="numeric"
              maxLength={4}
              autoComplete="current-password"
              placeholder="••••"
              className={`${inputCls} tracking-[0.5em]`}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="st-pin" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Nouveau code
              </label>
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-bold text-brand-600 transition hover:text-brand-700 dark:text-brand-400"
              >
                <EyeIcon off={showPin} />
                {showPin ? "Masquer" : "Afficher"}
              </button>
            </div>
            <input
              id="st-pin"
              name="pin"
              type={showPin ? "text" : "password"}
              required
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              className={`${inputCls} tracking-[0.5em]`}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="st-confirm-pin" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Confirmer le nouveau code
              </label>
              <button
                type="button"
                onClick={() => setShowConfirmPin((v) => !v)}
                className="flex items-center gap-1 text-[11px] font-bold text-brand-600 transition hover:text-brand-700 dark:text-brand-400"
              >
                <EyeIcon off={showConfirmPin} />
                {showConfirmPin ? "Masquer" : "Afficher"}
              </button>
            </div>
            <input
              id="st-confirm-pin"
              name="confirmPin"
              type={showConfirmPin ? "text" : "password"}
              required
              inputMode="numeric"
              maxLength={4}
              placeholder="••••"
              className={`${inputCls} tracking-[0.5em]`}
            />
          </div>

          <button
            type="submit"
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
          >
            Mettre à jour le code
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
          <p className="text-center text-xs leading-relaxed text-slate-400">
            Votre code protège l&apos;accès à votre compte. Ne le partagez avec personne.
          </p>
        </form>
      </section>
    </div>
  );
}
