"use client";

import { useEffect, useRef, useState } from "react";

// Mode « Présentation » du billet — standard du marché (Eventbrite, DICE, SeeTickets) :
// plein écran + luminosité maximale + écran maintenu allumé (Wake Lock API) pour un scan fiable.
// Fallback gracieux : si le plein écran ou le wake lock ne sont pas supportés, l'aperçu reste utilisable.
export default function TicketPresent({ qr, code }: { qr: string; code: string }) {
  const [active, setActive] = useState(false);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => {
    if (!active) return;

    const start = async () => {
      try {
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      } catch {
        /* plein écran non supporté — l'aperçu reste accessible */
      }
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
        };
        if (nav.wakeLock?.request) wakeLockRef.current = await nav.wakeLock.request("screen");
      } catch {
        /* wake lock indisponible (ex. iOS) */
      }
    };
    start();

    const onFullscreen = () => {
      if (!document.fullscreenElement) setActive(false);
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      wakeLockRef.current?.release().catch(() => {});
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [active]);

  if (!active) {
    return (
      <button
        onClick={() => setActive(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
        Présenter mon billet
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-black"
      onClick={() => setActive(false)}
      role="dialog"
      aria-label="Billet en mode présentation"
    >
      <div className="rounded-3xl bg-white p-5 shadow-2xl">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={`QR code du billet ${code}`} className="h-72 w-72 max-w-[80vw] sm:h-80 sm:w-80" />
      </div>
      <p className="text-center text-sm font-bold text-white/90">
        Présentez ce QR à l&apos;entrée
      </p>
      <p className="text-center text-xs text-white/50">
        Touchez l&apos;écran pour quitter le mode présentation
      </p>
      <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-[11px] font-bold text-emerald-300">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        EN DIRECT
      </span>
    </div>
  );
}
