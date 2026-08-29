"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Ably from "ably";
import Link from "next/link";

export type LiveNotification = {
  kind: "gauge" | "payment" | "tickets" | "checkin";
  title: string;
  desc: string;
  href?: string;
  at: number;
};

// Icône et couleur par type de notification.
function kindStyle(kind: LiveNotification["kind"]) {
  switch (kind) {
    case "gauge":
      return {
        cls: "bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400",
        icon: (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>
        ),
      };
    case "payment":
      return {
        cls: "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
        icon: (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
        ),
      };
    case "tickets":
      return {
        cls: "bg-sky-100 text-sky-600 dark:bg-sky-950 dark:text-sky-400",
        icon: (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M13 5v2M13 17v2M13 11v2" /></svg>
        ),
      };
    default:
      return {
        cls: "bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-400",
        icon: (
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
        ),
      };
  }
}

// Toast en direct : apparaît en bas à droite pendant quelques secondes.
function LiveToast({ item, onClose }: { item: LiveNotification; onClose: () => void }) {
  const style = kindStyle(item.kind);
  return (
    <div className="animate-pop fixed bottom-5 right-5 z-[60] w-80 max-w-[calc(100vw-2.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start gap-3 p-4">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${style.cls}`}>{style.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white">{item.title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
          {item.href && (
            <Link href={item.href} className="mt-1 inline-block text-xs font-bold text-brand-600 hover:underline dark:text-brand-400" onClick={onClose}>
              Voir →
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>
    </div>
  );
}

// Composant global : écoute les notifications temps réel Ably, incrémente le
// compteur du lien « Notifications » (par repère [data-notif-badge]) et affiche
// un toast pour chaque événement.
export default function LiveNotifications() {
  const [toast, setToast] = useState<LiveNotification | null>(null);
  const countRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateBadge = useCallback((count: number) => {
    document.querySelectorAll<HTMLElement>("[data-notif-badge]").forEach((el) => {
      el.textContent = count > 0 ? String(count) : "";
      el.classList.toggle("hidden", count === 0);
    });
  }, []);

  useEffect(() => {
    let client: Ably.Realtime | null = null;
    let cancelled = false;

    const connect = async () => {
      try {
        const res = await fetch("/api/ably/auth", { cache: "no-store" });
        if (!res.ok || res.status === 401) return; // non connecté / Ably non configuré : silencieux
        const token = await res.json();
        if (!token || token.error) return; // réponse d'erreur → silencieux
        client = new Ably.Realtime({
          authCallback: (_data, cb) => cb(null, token),
        });
        const channel = client.channels.get(`notif-${token.clientId}`);
        await channel.subscribe("notification", (message) => {
          const item = message.data as LiveNotification;
          if (!item?.title || cancelled) return;
          countRef.current += 1;
          updateBadge(countRef.current);
          setToast(item);
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => setToast(null), 6000);
        });
      } catch {
        /* temps réel indisponible : on garde la page statique */
      }
    };
    connect();

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      client?.close();
    };
  }, [updateBadge]);

  return toast ? <LiveToast item={toast} onClose={() => setToast(null)} /> : null;
}
