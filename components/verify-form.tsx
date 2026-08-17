"use client";

import { useState } from "react";
import Link from "next/link";
import { registerAction } from "@/app/actions";
import { displayPhone } from "@/lib/format";

const ERRORS: Record<string, string> = {
  otp_format: "Le code de vérification doit contenir exactement 6 chiffres.",
  otp_bad: "Code de vérification incorrect ou expiré. Relancez une demande.",
  pin_format: "Le code personnel doit contenir exactement 4 chiffres.",
  pin_mismatch: "Les deux codes personnels ne correspondent pas.",
  rate_limited: "Trop de tentatives. Réessayez plus tard.",
  phone_taken: "Ce numéro est déjà utilisé. Connectez-vous avec celui-ci.",
};

type VerifyFormProps = {
  phone: string;
  name: string;
  err?: string | null;
};

function EyeIcon({ off = false }: { off?: boolean }) {
  return off ? (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /></svg>
  ) : (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
  );
}

// Champ centré (code OTP / PIN) avec focus soigné.
const codeInputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-center text-xl font-bold tracking-[0.5em] text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white dark:placeholder:text-slate-600 dark:focus:border-brand-500 dark:focus:bg-slate-900";

export default function VerifyForm({ phone, name, err }: VerifyFormProps) {
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  return (
    <form action={registerAction} className="space-y-5">
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="phone" value={phone} />

      {/* Progression façon SIGMA EVENTS : segments + ÉTAPE 2 / 3 */}
      <div>
        <div className="mb-2 flex gap-1.5">
          {[1, 2, 3].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= 2 ? "bg-brand-500" : "bg-slate-200 dark:bg-slate-700"}`} />
          ))}
        </div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
          Étape 2 / 3 · Vérification SMS + code personnel
        </p>
      </div>

      {err && ERRORS[err] && (
        <div role="alert" className="animate-fade-up flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
          <p className="font-semibold">{ERRORS[err]}</p>
        </div>
      )}

      {/* Récapitulatif du compte en cours de création */}
      <div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3 dark:border-white/10 dark:bg-white/5 backdrop-blur-sm">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/25">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-slate-900 dark:text-white">{name}</p>
          <p className="truncate text-[11px] font-semibold text-brand-700 dark:text-brand-400">
            Création de compte organisateur
          </p>
        </div>
      </div>

      {/* Code OTP */}
      <div>
        <label htmlFor="otp" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
          Code de vérification
        </label>
        <div className="relative">
          <input
            id="otp"
            name="otp"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            placeholder="••••••"
            className={codeInputCls}
          />
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          Envoyé au <b className="text-slate-600 dark:text-slate-300">{displayPhone(phone)}</b> — le code expire dans 10 minutes.
        </p>
      </div>

      {/* Code personnel */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="pin" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Créez votre code personnel (4 chiffres)
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
          id="pin"
          name="pin"
          type={showPin ? "text" : "password"}
          required
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
          className={codeInputCls}
        />
      </div>

      {/* Confirmation du code personnel */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="confirmPin" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Confirmez le code personnel
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
          id="confirmPin"
          name="confirmPin"
          type={showConfirmPin ? "text" : "password"}
          required
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
          className={codeInputCls}
        />
      </div>

      <button
        type="submit"
        className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3.5 font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0"
      >
        Vérifier et créer mon compte
        <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
      </button>

      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        Vous avez saisi le mauvais numéro ?{" "}
        <Link href="/register" className="font-bold text-brand-600 hover:underline dark:text-brand-400">
          Recommencer
        </Link>
      </p>

      <p className="border-t border-slate-100 pt-4 text-center text-[11px] leading-relaxed text-slate-400 dark:border-slate-800 dark:text-slate-500">
        Connexion sécurisée — vos données restent protégées.
      </p>
    </form>
  );
}
