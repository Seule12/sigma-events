"use client";

import { useState } from "react";
import Link from "next/link";
import { resetPinAction } from "@/app/actions";
import { displayPhone } from "@/lib/format";

const ERRORS: Record<string, string> = {
  otp_format: "Le code de vérification doit contenir exactement 6 chiffres.",
  otp_bad: "Code de vérification incorrect ou expiré. Recommencez.",
  pin_format: "Le code personnel doit contenir exactement 4 chiffres.",
  pin_mismatch: "Les deux codes personnels ne correspondent pas.",
  rate_limited: "Trop de tentatives. Réessayez dans quelques minutes.",
};

function EyeIcon({ off = false }: { off?: boolean }) {
  return off ? (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /></svg>
  ) : (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
  );
}

const codeInputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-center text-xl font-bold tracking-[0.5em] text-slate-900 outline-none transition placeholder:text-slate-300 focus:border-brand-500 focus:bg-white focus:ring-4 focus:ring-brand-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-600 dark:focus:border-brand-500 dark:focus:bg-slate-900";

export default function ResetPinForm({ phone, err }: { phone: string; err?: string | null }) {
  const [showPin, setShowPin] = useState(false);
  const [showConfirmPin, setShowConfirmPin] = useState(false);

  return (
    <form action={resetPinAction} className="space-y-5">
      <input type="hidden" name="phone" value={phone} />

      {/* Progression façon SIGMA EVENTS : segments + ÉTAPE 2 / 2 (même langage
          que la vérification d'inscription, composant verify-form.tsx) */}
      <div>
        <div className="mb-2 flex gap-1.5">
          {[1, 2].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${s <= 2 ? "bg-brand-500" : "bg-slate-200 dark:bg-slate-700"}`} />
          ))}
        </div>
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
          Étape 2 / 2 · Nouveau code personnel
        </p>
      </div>

      {err && ERRORS[err] && (
        <div role="alert" className="animate-fade-up flex items-start gap-2.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300">
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
          <p className="font-semibold">{ERRORS[err]}</p>
        </div>
      )}

      {/* Récapitulatif : numéro concerné */}
      <div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 px-4 py-3 dark:border-brand-800 dark:bg-brand-950/30">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-md shadow-brand-600/25">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Réinitialisation pour</p>
          <p className="truncate text-sm font-extrabold text-slate-900 dark:text-white">{displayPhone(phone)}</p>
        </div>
      </div>

      {/* Code OTP */}
      <div>
        <label htmlFor="reset-otp" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
          Code de vérification
        </label>
        <input
          id="reset-otp"
          name="otp"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          autoFocus
          placeholder="••••••"
          className={codeInputCls}
        />
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
          Envoyé par SMS — le code expire dans 10 minutes.
        </p>
      </div>

      {/* Nouveau code personnel */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="reset-pin" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Nouveau code personnel (4 chiffres)
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
          id="reset-pin"
          name="pin"
          type={showPin ? "text" : "password"}
          required
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
          className={codeInputCls}
        />
      </div>

      {/* Confirmation du nouveau code */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="reset-confirm-pin" className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Confirmez le nouveau code
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
          id="reset-confirm-pin"
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
        Réinitialiser mon code
        <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
      </button>

      <p className="text-center text-sm text-slate-500 dark:text-slate-400">
        Vous n&apos;avez pas reçu le code ?{" "}
        <Link href={`/recuperer?phone=${encodeURIComponent(phone)}`} className="font-bold text-brand-600 hover:underline dark:text-brand-400">
          Renvoyer un code
        </Link>
      </p>

      <p className="border-t border-slate-100 pt-4 text-center text-[11px] leading-relaxed text-slate-400 dark:border-slate-800 dark:text-slate-500">
        Connexion sécurisée — vos données restent protégées.
      </p>
    </form>
  );
}
