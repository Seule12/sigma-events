"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// En attente de confirmation webhook : recharge la page toutes les 5 s.
// Quand le paiement est confirmé (ordre PAID), la page serveur affiche la
// facture + les billets. À défaut, l'utilisateur reste sur « confirmation en cours ».
//
// Si après 60 s le webhook n'a toujours pas confirmé (passerelle lente, webhook
// non reçu…), on affiche un recours : réessayer la vérification + lien vers la
// page de paiement, au lieu de recharger indéfiniment sans issue.
export default function ConfirmationPoll({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setElapsed((s) => s + 5);
      router.refresh();
    }, 5000);
    return () => clearInterval(t);
  }, [router]);

  if (elapsed < 60) return null;

  return (
    <div className="animate-fade-up mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-center dark:border-amber-900 dark:bg-amber-950/40">
      <p className="text-sm font-bold text-amber-800 dark:text-amber-300">
        La confirmation prend plus de temps que prévu.
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
        Si vous avez bien payé, votre billet est en cours d&apos;émission. Sinon, vous pouvez
        retourner au paiement et réessayer.
      </p>
      <div className="mt-3 flex justify-center gap-2">
        <button
          type="button"
          onClick={() => {
            setElapsed(0);
            router.refresh();
          }}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-amber-700"
        >
          Réessayer la vérification
        </button>
        <a
          href={`/acheter/payer/${orderId}`}
          className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-950/40"
        >
          Retour au paiement
        </a>
      </div>
    </div>
  );
}
