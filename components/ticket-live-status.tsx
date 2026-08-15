"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Statut LIVE du billet : rafraîchit la page toutes les 15 s pour refléter en temps
// réel un scan d'entrée (statut « Déjà utilisé ») ou une révocation, sans rechargement manuel.
// Le composant ne rend rien : il déclenche juste un re-render serveur (router.refresh()).
export default function TicketLiveStatus({ code, intervalMs = 15_000 }: { code: string; intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const timer = setInterval(async () => {
      if (cancelled || document.visibilityState === "hidden") return;
      try {
        // re-render serveur : reflète le dernier statut en base (ENTERED / BLACKLISTED …)
        router.refresh();
      } catch {
        /* réseau indisponible — on retente au prochain tick */
      }
    }, intervalMs);

    // Rafraîchissement immédiat quand l'onglet redevient visible (reprise de focus).
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [code, intervalMs, router]);

  return null;
}
