"use client";

import { useState } from "react";
import Link from "next/link";
import { loginAction, requestOtpAction } from "@/app/actions";
import SocialButtons from "@/components/social-buttons";

type Tab = "login" | "register";

const PROFILES = [
  {
    id: "particulier",
    title: "Particulier",
    desc: "Mariage, anniversaire, cérémonie…",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
    ),
  },
  {
    id: "organisation",
    title: "Organisation",
    desc: "Entreprise, école, association…",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" /></svg>
    ),
  },
  {
    id: "pro",
    title: "Pro de l'événementiel",
    desc: "Agence, promoteur, prestataire…",
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" /></svg>
    ),
  },
];

// Champs « verre dépoli » : légère translucidité + flou d'arrière-plan, le fond
// de la page transparaît (aucune carte autour du formulaire).
const inputCls =
  "w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-white outline-none backdrop-blur-xl transition placeholder:text-slate-500 hover:border-white/20 focus:border-brand-400 focus:bg-white/10 focus:ring-4 focus:ring-brand-500/25";

const selectCls =
  "w-full rounded-xl border border-white/10 bg-white/5 py-3 pl-4 pr-4 text-sm text-white outline-none backdrop-blur-xl transition hover:border-white/20 focus:border-brand-400 focus:bg-white/10 focus:ring-4 focus:ring-brand-500/25 [&>option]:bg-slate-900 [&>option]:text-white";

// Label façon SIGMA EVENTS : mono, majuscule, espacé.
const labelCls =
  "mb-1.5 block font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400";

function FieldIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
      {children}
    </span>
  );
}

// Sélections du profil PRO (volume d'activité — segmentation du modèle économique)
const EVENTS_PER_MONTH = ["1-2", "3-5", "6-10", "10+"];
const PARTICIPANTS = ["moins de 100", "100-500", "500-2 000", "2 000+"];

function RegisterForm({ onSwitchLogin }: { onSwitchLogin: () => void }) {
  const [profile, setProfile] = useState("particulier");
  const [showExtra, setShowExtra] = useState(false);

  return (
    <form action={requestOtpAction} className="space-y-4">
      <div className="mb-5 flex items-center gap-3">
        <div className="h-1 w-10 rounded-full bg-gradient-to-r from-brand-500 to-emerald-400" />
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Vérification par email</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-slate-200">Comment allez-vous utiliser Sigma ?</p>
        <div className="space-y-2">
          {PROFILES.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-xl transition has-[:checked]:border-brand-400 has-[:checked]:bg-brand-500/10 has-[:checked]:shadow-lg has-[:checked]:shadow-brand-500/10 hover:border-brand-400/50"
            >
              <input
                type="radio"
                name="profile"
                value={p.id}
                checked={profile === p.id}
                onChange={() => setProfile(p.id)}
                className="peer sr-only"
              />
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-brand-300 transition peer-checked:bg-brand-500/20">{p.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-white">{p.title}</span>
                <span className="block text-[11px] text-slate-400">{p.desc}</span>
              </span>
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 border-white/30 peer-checked:border-brand-400 peer-checked:bg-brand-400">
                <span className="h-2 w-2 rounded-full bg-white" />
              </span>
            </label>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="ap-name" className={labelCls}>
          Nom complet
        </label>
        <div className="relative">
          <FieldIcon>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          </FieldIcon>
          <input id="ap-name" name="name" required autoComplete="name" placeholder="Ex : Aïcha Zinsou" className={inputCls} />
        </div>
      </div>
      <div>
        <label htmlFor="ap-email" className={labelCls}>
          Adresse email
        </label>
        <div className="relative">
          <FieldIcon>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 6L2 7" /></svg>
          </FieldIcon>
          <input id="ap-email" name="email" type="email" required autoComplete="email" placeholder="Ex : aicha@gmail.com" className={inputCls} />
        </div>
      </div>
      <div>
        <label htmlFor="ap-reg-phone" className={labelCls}>
          Numéro de téléphone
        </label>
        <div className="relative">
          <FieldIcon>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
          </FieldIcon>
          <input id="ap-reg-phone" name="phone" type="tel" required autoComplete="tel" inputMode="tel" placeholder="97 00 00 00" className={inputCls} />
        </div>
        <p className="mt-1 text-xs text-slate-500">Sans le +229</p>
      </div>

      {/* Champs de profil enrichis (Organisation / Pro) */}
      {profile !== "particulier" && (
        <div className="animate-fade-up space-y-4 rounded-2xl border border-brand-400/20 bg-brand-500/[0.06] p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-300">
            {profile === "organisation" ? "Votre structure" : "Votre agence / structure"}
          </p>
          <div>
            <label htmlFor="ap-org" className={labelCls}>
              {profile === "organisation" ? "Nom de la structure" : "Nom de l'agence"} *
            </label>
            <input id="ap-org" name="orgName" required placeholder={profile === "organisation" ? "Ex : Groupe scolaire Le Savoir" : "Ex : Akpakpa Events & Security"} className={inputCls} />
          </div>
          <div>
            <label htmlFor="ap-org-email" className={labelCls}>
              Email professionnel *
            </label>
            <div className="relative">
              <FieldIcon>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 6L2 7" /></svg>
              </FieldIcon>
              <input id="ap-org-email" name="orgEmail" type="email" required autoComplete="email" placeholder="contact@agence.com" className={inputCls} />
            </div>
          </div>

          {profile === "pro" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="ap-responsible" className={labelCls}>
                    Nom du responsable
                  </label>
                  <input
                    id="ap-responsible"
                    name="responsibleName"
                    placeholder="Ex : Jean-Marc Agbodjan"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="ap-pro-phone" className={labelCls}>
                    Téléphone professionnel
                  </label>
                  <input
                    id="ap-pro-phone"
                    name="proPhone"
                    type="tel"
                    inputMode="tel"
                    placeholder="95 00 00 00"
                    className={inputCls}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExtra((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-bold text-brand-300 transition hover:text-brand-200"
              >
                <svg className={`h-3.5 w-3.5 transition-transform ${showExtra ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                Volume d&apos;activité (optionnel)
              </button>
              {showExtra && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="ap-events" className={labelCls}>
                      Événements / mois
                    </label>
                    <select id="ap-events" name="avgEventsPerMonth" className={selectCls} defaultValue="">
                      <option value="">— Choisir —</option>
                      {EVENTS_PER_MONTH.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="ap-participants" className={labelCls}>
                      Participants / événement
                    </label>
                    <select id="ap-participants" name="avgParticipants" className={selectCls} defaultValue="">
                      <option value="">— Choisir —</option>
                      {PARTICIPANTS.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <button
        type="submit"
        className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3.5 font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-600/40 active:translate-y-0"
      >
        Recevoir mon code de vérification
        <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
      </button>
      <p className="text-center text-xs leading-relaxed text-slate-500">
        Un code à 6 chiffres vous sera envoyé par email pour finaliser votre inscription.
      </p>
      <p className="text-center text-sm text-slate-400">
        Déjà inscrit ?{" "}
        <button type="button" onClick={onSwitchLogin} className="font-bold text-brand-400 hover:text-brand-300 hover:underline">
          Se connecter
        </button>
      </p>
    </form>
  );
}

export default function AuthPanel({
  initialTab = "login",
  socialEnabled = [],
  oauthMessage = null,
  loginError = null,
  registerError = null,
  successMessage = null,
  hideHeader = false,
  hideTabs = false,
}: {
  initialTab?: Tab;
  socialEnabled?: string[];
  oauthMessage?: string | null;
  loginError?: string | null;
  registerError?: string | null;
  successMessage?: string | null;
  // Pages dédiées (/login, /register) : masquer l'en-tête interne et les onglets
  // pour laisser la page afficher son propre titre (design pro, façon SIGMA EVENTS).
  hideHeader?: boolean;
  hideTabs?: boolean;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [showPin, setShowPin] = useState(false);

  return (
    <div className="animate-fade-up w-full">
      {/* En-tête (masqué sur les pages dédiées qui affichent leur propre titre) */}
      {!hideHeader && (
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 text-white shadow-lg shadow-brand-600/30">
            {tab === "login" ? (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>
            )}
          </div>
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
            {tab === "login" ? "Ravi de vous revoir" : "Créez votre compte"}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {tab === "login"
              ? "Connectez-vous pour retrouver vos événements et vos ventes."
              : "Gratuit, sans carte bancaire — 30 secondes suffisent."}
          </p>
        </div>
      )}

      {/* Message d'erreur de connexion (numéro ou code incorrect) */}
      {loginError && tab === "login" && (
        <div className="animate-fade-up mb-5 flex items-start gap-2.5 rounded-2xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-300 backdrop-blur-xl">
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
          <p className="font-semibold">{loginError}</p>
        </div>
      )}

      {/* Message d'erreur d'inscription (numéro invalide, déjà pris, trop de demandes) */}
      {registerError && tab === "register" && (
        <div className="animate-fade-up mb-5 flex items-start gap-2.5 rounded-2xl border border-red-900/60 bg-red-950/50 px-4 py-3 text-sm text-red-300 backdrop-blur-xl">
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
          <p className="font-semibold">{registerError}</p>
        </div>
      )}

      {/* Message de succès (ex : code personnel réinitialisé) */}
      {successMessage && (
        <div className="animate-fade-up mb-5 flex items-start gap-2.5 rounded-2xl border border-emerald-900/60 bg-emerald-950/50 px-4 py-3 text-sm text-emerald-300 backdrop-blur-xl">
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          <p className="font-semibold">{successMessage}</p>
        </div>
      )}

      {/* Message de retour OAuth */}
      {oauthMessage && (
        <div className="animate-fade-up mb-5 flex items-start gap-2.5 rounded-2xl border border-amber-900/60 bg-amber-950/50 px-4 py-3 text-sm text-amber-300 backdrop-blur-xl">
          <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
          <p className="font-semibold">{oauthMessage}</p>
        </div>
      )}

      {/* Onglets (masqués sur les pages dédiées qui basculent via leurs propres liens) */}
      {!hideTabs && (
        <div className="mb-6 grid grid-cols-2 gap-1 rounded-2xl bg-white/5 p-1.5 backdrop-blur-xl">
        {(
          [
            {
              id: "login",
              label: "Se connecter",
              icon: (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" /></svg>
              ),
            },
            {
              id: "register",
              label: "Créer un compte",
              icon: (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3z" /></svg>
              ),
            },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={`flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold transition-all ${
              tab === t.id
                ? "bg-white text-slate-900 shadow-lg shadow-black/20 dark:bg-slate-900 dark:text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        </div>
      )}

      {/* Connexion sociale — masquée tant qu'aucun fournisseur n'est configuré (évite
          les boutons « Bientôt disponible » morts au premier contact) */}
      {socialEnabled.length > 0 && (
        <>
          <div className="mb-5 space-y-2.5">
            <SocialButtons enabled={socialEnabled} />
          </div>

          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-slate-950 px-3 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                ou avec votre téléphone
              </span>
            </div>
          </div>
        </>
      )}

      {tab === "login" ? (
        <form action={loginAction} className="space-y-4">
          <div>
            <label htmlFor="ap-phone" className={labelCls}>
              Numéro de téléphone
            </label>
            <div className="relative">
              <FieldIcon>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
              </FieldIcon>
              <input id="ap-phone" name="phone" type="tel" required autoComplete="tel" inputMode="tel" placeholder="97 00 00 00" className={inputCls} />
            </div>
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="ap-pin" className="block text-sm font-semibold text-white/90">
                Code personnel
              </label>
              <div className="flex items-center gap-3">
                <Link
                  href="/recuperer"
                  className="text-[11px] font-bold text-brand-400 transition hover:text-brand-300 hover:underline"
                >
                  Code oublié ?
                </Link>
                <button
                  type="button"
                  onClick={() => setShowPin((v) => !v)}
                  className="flex items-center gap-1 text-[11px] font-bold text-brand-400 transition hover:text-brand-300"
                >
                  {showPin ? (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><path d="M1 1l22 22" /></svg>
                  ) : (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                  )}
                  {showPin ? "Masquer" : "Afficher"}
                </button>
              </div>
            </div>
            <div className="relative">
              <FieldIcon>
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              </FieldIcon>
              <input
                id="ap-pin"
                name="pin"
                type={showPin ? "text" : "password"}
                required
                inputMode="numeric"
                maxLength={4}
                autoComplete="current-password"
                placeholder="••••"
                className={`${inputCls} tracking-[0.5em]`}
              />
            </div>
          </div>
          <button
            type="submit"
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3.5 font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-600/40 active:translate-y-0"
          >
            Se connecter
            <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" /></svg>
          </button>

          <p className="text-center text-sm text-slate-400">
            Pas encore de compte ?{" "}
            <button type="button" onClick={() => setTab("register")} className="font-bold text-brand-400 hover:text-brand-300 hover:underline">
              Créer un compte gratuit
            </button>
          </p>
        </form>
      ) : (
        <RegisterForm onSwitchLogin={() => setTab("login")} />
      )}

    </div>
  );
}
