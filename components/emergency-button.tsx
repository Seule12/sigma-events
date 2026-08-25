"use client";

import { useState } from "react";

type EmergencyButtonProps = {
  eventId: string;
  eventCapacity: number;
  validCount: number;
};

const CATEGORIES = [
  { label: "Sécurité", icon: "shield" },
  { label: "Médical", icon: "medical" },
  { label: "Incident de foule", icon: "users" },
  { label: "Logistique", icon: "truck" },
  { label: "Fraude", icon: "flag" },
  { label: "Technique", icon: "tool" },
];

export default function EmergencyButton({ eventId, eventCapacity, validCount }: EmergencyButtonProps) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const pct = eventCapacity > 0 ? Math.round((validCount / eventCapacity) * 100) : 0;

  async function handleSubmit() {
    if (!selected) return;
    setSending(true);

    try {
      // Résoudre le categoryId (mapping label → id via l'API)
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // On envoie le nom de catégorie — l'API le résoudra
          categoryName: selected,
          level: "CRITICAL",
          content: note || `Incident signalé — ${selected}`,
          location: `Événement (${pct}% jauge)`,
          eventId,
        }),
      });

      if (res.ok) {
        setSent(true);
        setTimeout(() => {
          setOpen(false);
          setSent(false);
          setSelected(null);
          setNote("");
        }, 2000);
      }
    } catch {
      // En mode hors-ligne, on notera l'incident
      console.error("[emergency] Impossible de signaler l'incident");
    }
    setSending(false);
  }

  return (
    <>
      {/* Bouton flottant */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-red-600 px-5 py-3.5 font-bold text-white shadow-xl shadow-red-600/40 transition hover:-translate-y-0.5 hover:bg-red-700 hover:shadow-2xl active:translate-y-0"
        aria-label="Signaler un incident"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span className="text-sm">Urgence</span>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { if (!sending) setOpen(false); }} />

          {/* Contenu */}
          <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl dark:bg-slate-900">
            {sent ? (
              <div className="py-8 text-center">
                <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                  <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </div>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">Incident signalé</h3>
                <p className="mt-1 text-sm text-slate-500">L&apos;admin a été notifié en temps réel.</p>
              </div>
            ) : (
              <>
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-lg font-extrabold text-red-600">Signaler un incident</h3>
                  <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                  </button>
                </div>

                <p className="mb-4 text-sm text-slate-500">
                  Choisissez le type d&apos;incident. L&apos;alerte sera transmise immédiatement au command center.
                </p>

                {/* Grille de catégories */}
                <div className="mb-4 grid grid-cols-2 gap-2">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.label}
                      onClick={() => setSelected(cat.label)}
                      className={`rounded-xl border-2 p-3 text-left text-sm font-bold transition ${
                        selected === cat.label
                          ? "border-red-500 bg-red-50 text-red-700 dark:border-red-400 dark:bg-red-950/50 dark:text-red-300"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Note optionnelle */}
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Détails (optionnel)..."
                  rows={2}
                  className="mb-4 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />

                {/* Bouton envoyer */}
                <button
                  onClick={handleSubmit}
                  disabled={!selected || sending}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3.5 font-bold text-white shadow-lg shadow-red-600/30 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 disabled:opacity-50"
                >
                  {sending ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor" /></svg>
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                      </svg>
                      Envoyer l&apos;alerte
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
