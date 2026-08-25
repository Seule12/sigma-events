"use client";

import { useEffect, useState } from "react";

/**
 * Affiche un indicateur visuel pendant que le client confirme le STK push
 * sur son téléphone. Le composant poll le statut de la commande côté client
 * et rafraîchit la page quand le paiement est confirmé.
 */
export default function StkPushWaiting({ orderId }: { orderId: string }) {
  const [elapsed, setElapsed] = useState(0);
  const [dots, setDots] = useState("");

  useEffect(() => {
    // Animation des points de suspension
    const dotsTimer = setInterval(() => {
      setDots((d) => (d.length >= 3 ? "" : d + "."));
    }, 600);

    // Rafraîchir la page toutes les 5s pour vérifier le statut
    const refreshTimer = setInterval(() => {
      setElapsed((s) => s + 5);
      window.location.reload();
    }, 5000);

    return () => {
      clearInterval(dotsTimer);
      clearInterval(refreshTimer);
    };
  }, [orderId]);

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-950/40">
      {/* Icône animée */}
      <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-amber-100 dark:bg-amber-900/30">
        <svg className="h-8 w-8 animate-pulse text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
          <line x1="12" y1="18" x2="12.01" y2="18" />
        </svg>
      </div>

      <h3 className="text-lg font-extrabold text-amber-800 dark:text-amber-300">
        Confirmez sur votre téléphone{dots}
      </h3>

      <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
        Un message de confirmation a été envoyé sur votre téléphone.
        <br />
        <b>Saisissez votre code PIN</b> Mobile Money pour valider le paiement.
      </p>

      <div className="mt-4 flex items-center justify-center gap-2">
        <div className="h-2 w-2 animate-bounce rounded-full bg-amber-500 [animation-delay:-0.3s]" />
        <div className="h-2 w-2 animate-bounce rounded-full bg-amber-500 [animation-delay:-0.15s]" />
        <div className="h-2 w-2 animate-bounce rounded-full bg-amber-500" />
      </div>

      {elapsed >= 30 && (
        <div className="mt-4 border-t border-amber-200 pt-4 dark:border-amber-800">
          <p className="text-xs text-amber-600 dark:text-amber-500">
            Le paiement peut prendre quelques secondes. Si vous avez bien confirmé,
            la page se met à jour automatiquement.
          </p>
        </div>
      )}
    </div>
  );
}
