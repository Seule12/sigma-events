"use client";

import { useState } from "react";

// Image de couverture avec repli silencieux : si l'URL ne charge pas (hors-ligne,
// lien mort), le composant renvoie null et le conteneur (qui a son propre fond)
// prend le relais — pas de bande vide.
export default function CoverImage({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="h-full w-full object-cover" onError={() => setFailed(true)} />
  );
}
