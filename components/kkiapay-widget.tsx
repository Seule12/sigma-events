"use client";

import { useEffect, useRef, useState } from "react";

// Widget de paiement KKIAPAY (client) : charge le SDK https://cdn.kkiapay.me/k.js
// puis ouvre openKkiapayWidget. Après paiement, KKIAPAY redirige vers `callback`
// (la page de confirmation, qui recharge tant que le webhook n'a pas confirmé).
//
// Sandbox : les numéros de test KKIAPAY simulent les scénarios
// (ex. 61000000 = succès MTN Bénin, 68000000 = succès Moov, 68000003 = refus).

declare global {
  interface Window {
    openKkiapayWidget?: (opts: Record<string, unknown>) => void;
    __kkiapaySdkLoaded?: boolean;
  }
}

type KkiapayWidgetProps = {
  amount: number; // FCFA total (billets + frais de livraison)
  publicKey: string;
  sandbox: boolean;
  phone: string;
  name: string;
  email?: string | null;
  callback: string; // URL de redirection après paiement réussi
  partnerId: string; // référence commande (SIG-XXXXXX) → retrouvée au webhook
  data?: string; // JSON libre (ex. {orderId}) renvoyé dans stateData au webhook
};

export default function KkiapayWidget({
  amount,
  publicKey,
  sandbox,
  phone,
  name,
  email,
  callback,
  partnerId,
  data,
}: KkiapayWidgetProps) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const openedRef = useRef(false);

  // Charge le SDK KKIAPAY une seule fois par page.
  useEffect(() => {
    if (window.__kkiapaySdkLoaded || window.openKkiapayWidget) {
      setReady(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://cdn.kkiapay.me/k.js";
    script.async = true;
    script.onload = () => {
      window.__kkiapaySdkLoaded = true;
      setReady(true);
    };
    script.onerror = () => setError("Impossible de charger le module de paiement. Vérifiez votre connexion.");
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const open = () => {
    if (!window.openKkiapayWidget || openedRef.current) return;
    openedRef.current = true;
    setOpening(true);
    window.openKkiapayWidget({
      amount,
      key: publicKey,
      sandbox,
      phone,
      name,
      email: email || "",
      callback,
      partnerId,
      ...(data ? { data } : {}),
      paymentmethod: ["momo"],
      countries: ["BJ"],
      theme: "#7c3aed",
      position: "center",
    });
  };

  // Ouvre le widget automatiquement dès que le SDK est chargé (le widget est un
  // overlay de la page, pas une popup → pas bloqué par le navigateur).
  useEffect(() => {
    if (ready && !openedRef.current) open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <div className="space-y-3 text-center">
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      ) : !ready ? (
        <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600" />
          Chargement du paiement sécurisé…
        </div>
      ) : (
        <>
          {sandbox && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              Mode test : utilisez un numéro KKIAPAY (ex. <b>61000000</b> = succès, <b>68000003</b> = refus).
            </p>
          )}
          <button
            type="button"
            onClick={open}
            disabled={opening}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-4 text-base font-bold text-white shadow-xl shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-2xl disabled:opacity-60"
          >
            {opening ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Paiement en cours…
              </>
            ) : (
              <>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
                Payer avec Mobile Money
              </>
            )}
          </button>
          <p className="text-[11px] text-slate-400">
            Vous serez redirigé(e) vers la fenêtre de paiement KKIAPAY (MTN MoMo · Moov Money · Celtiis Cash).
            Après paiement, la confirmation s&apos;affiche automatiquement.
          </p>
        </>
      )}
    </div>
  );
}
