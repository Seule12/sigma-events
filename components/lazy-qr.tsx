"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

// QR code généré 100 % côté client : le serveur n'a plus à calculer des dizaines de
// QR à chaque chargement de page (opération CPU coûteuse avec la lib `qrcode`).
// - Mode par défaut (paresseux) : le QR n'est généré que lorsque la carte approche
//   de la zone visible (IntersectionObserver) — idéal pour les longues listes.
// - Mode `eager` : génération immédiate au montage — utilisé sur la page d'impression
//   où le QR doit être présent avant print / export PNG.
type LazyQrProps = {
  /** Contenu encodé dans le QR (calculé côté serveur : blob chiffré du billet, ou URL /t/{code} en repli). */
  content: string;
  /** Taille du QR en pixels (carré). */
  size?: number;
  /** Générer immédiatement au montage (impression / export) au lieu d'attendre la visibilité. */
  eager?: boolean;
  className?: string;
};

export default function LazyQr({ content, size = 220, eager = false, className = "" }: LazyQrProps) {
  const [src, setSrc] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const generate = () => {
      QRCode.toDataURL(content, {
        width: size,
        margin: 1,
        color: { dark: "#0f172a", light: "#ffffff" },
      })
        .then((dataUrl) => {
          if (!cancelled) setSrc(dataUrl);
        })
        .catch(() => {
          // QR illisible : on laisse le placeholder (aucune erreur bloquante).
        });
    };

    if (eager) {
      generate();
      return () => {
        cancelled = true;
      };
    }

    const el = boxRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      generate();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          generate();
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [content, size, eager]);

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="QR code" className={className} />;
  }
  return (
    <div ref={boxRef} className={`grid place-items-center bg-white ${className}`} aria-hidden>
      <span className="h-4 w-4 animate-pulse rounded-full bg-slate-300/60" />
    </div>
  );
}
