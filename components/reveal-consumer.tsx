"use client";

import { useEffect } from "react";
import { consumeRevealAction } from "@/app/actions";

// Consomme le cookie éphémère « sigma_reveal » (PIN agent / code d'activation
// terminal) après son affichage par la page événement : le secret n'est montré
// qu'une seule fois — un rechargement ou un retour arrière ne le réaffiche pas.
export default function RevealConsumer() {
  useEffect(() => {
    void consumeRevealAction().catch(() => {});
  }, []);
  return null;
}
