"use client";

import { useState } from "react";
import { sendInvitationsAction } from "@/app/actions";

export type BulkInviteItem = {
  id: string;
  guestName: string;
  guestPhone: string | null;
  guestEmail: string | null;
  guestCount: number;
};

export default function InviteBulkSend({
  eventId,
  invites,
}: {
  eventId: string;
  invites: BulkInviteItem[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [channel, setChannel] = useState<"WHATSAPP" | "EMAIL" | "SMS">("WHATSAPP");
  const [sending, setSending] = useState(false);
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const eligible = invites.filter((i) => channel === "EMAIL" ? i.guestEmail : i.guestPhone);
  const allSelected = eligible.length > 0 && eligible.every((i) => selected.has(i.id));

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(eligible.map((i) => i.id)));
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSend = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    setSending(true);
    setError(null);
    try {
      const res = await sendInvitationsAction(eventId, ids, channel);
      if (res.links.length === 0) {
        setError("Aucun contact disponible pour ce canal (téléphone WhatsApp ou email manquant).");
      } else {
        // On ouvre chaque canal pré-rempli (WhatsApp / email) dans un nouvel onglet,
        // comme si l'organisateur validait l'envoi depuis son téléphone.
        for (const link of res.links) {
          window.open(link.url, "_blank", "noopener,noreferrer");
        }
        setSentCount(res.sent);
        setSelected(new Set());
      }
    } catch {
      setError("L'envoi a échoué. Réessayez.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-brand-600 dark:text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          <p className="text-sm font-bold text-slate-900 dark:text-white">Envoi groupé</p>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
            {selected.size} sélectionné{selected.size > 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Choix du canal */}
          <div className="flex overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setChannel("WHATSAPP")}
              className={`px-3 py-2 text-xs font-bold transition ${channel === "WHATSAPP" ? "bg-[#25D366] text-white" : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"}`}
            >
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() => setChannel("EMAIL")}
              className={`px-3 py-2 text-xs font-bold transition ${channel === "EMAIL" ? "bg-brand-600 text-white" : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"}`}
            >
              Email
            </button>
            <button
              type="button"
              onClick={() => setChannel("SMS")}
              className={`px-3 py-2 text-xs font-bold transition ${channel === "SMS" ? "bg-sky-600 text-white" : "text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800"}`}
            >
              SMS
            </button>
          </div>
          <button
            type="button"
            onClick={toggleAll}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:text-slate-300"
          >
            {allSelected ? "Tout décocher" : "Tout cocher"}
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || selected.size === 0}
            className="rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? "Envoi…" : `Envoyer (${selected.size})`}
          </button>
        </div>
      </div>

      {sentCount !== null && !error && (
        <p className="animate-fade-up mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          {sentCount} invitation{sentCount > 1 ? "s" : ""} marquée{sentCount > 1 ? "s" : ""} « Envoyée » — les canaux pré-remplis sont ouverts, validez l&apos;envoi depuis votre téléphone.
        </p>
      )}
      {error && (
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</p>
      )}

      {/* Liste compacte avec cases à cocher */}
      {eligible.length > 0 && (
        <div className="mt-3 max-h-56 space-y-1 overflow-y-auto pr-1">
          {eligible.map((i) => (
            <label
              key={i.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <input
                type="checkbox"
                checked={selected.has(i.id)}
                onChange={() => toggle(i.id)}
                className="h-4 w-4 rounded border-slate-300 accent-brand-600"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-200">{i.guestName}</span>
                <span className="block truncate text-[11px] text-slate-400">
                  {channel === "EMAIL" ? i.guestEmail || "sans email" : i.guestPhone ? `+229 ${i.guestPhone}` : "sans téléphone"}
                  {i.guestCount > 1 ? ` · ${i.guestCount} pers.` : ""}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
