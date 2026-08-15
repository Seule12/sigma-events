"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// En attente de confirmation webhook : recharge la page toutes les 5 s.
// Quand le paiement est confirmé (ordre PAID), la page serveur affiche la
// facture + les billets. À défaut, l'utilisateur reste sur « confirmation en cours ».
export default function ConfirmationPoll() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
