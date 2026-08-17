"use client";

import { useEffect, useState } from "react";
import { coverSuggestions } from "@/lib/cover-suggestions";

// Sélecteur de couverture suggérée selon le type d'événement : l'organisateur
// tape le type (concert, mariage…) et peut reprendre une couverture générée,
// ou garder sa propre URL / image importée. Les suggestions sont des SVG en
// data URL (aucune dépendance externe).
export default function CoverSuggestionPicker({
  type,
  value,
  onChange,
}: {
  type: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [suggestions, setSuggestions] = useState(() => (type.trim().length >= 3 ? coverSuggestions(type) : []));

  // Recalcule les suggestions quand le type saisi change.
  useEffect(() => {
    setSuggestions(type.trim().length >= 3 ? coverSuggestions(type) : []);
  }, [type]);

  return (
    <div className="space-y-2">
      {suggestions.length > 0 && (
        <>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Suggestions pour « {type.trim()} » — cliquez pour choisir :
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {suggestions.map((s) => (
              <button
                key={s.url}
                type="button"
                onClick={() => onChange(s.url)}
                aria-pressed={value === s.url}
                className={`group overflow-hidden rounded-xl border-2 text-left transition ${
                  value === s.url
                    ? "border-brand-600 ring-2 ring-brand-600/30 dark:border-brand-500"
                    : "border-slate-200 hover:border-brand-400 dark:border-slate-700 dark:hover:border-brand-700"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.url} alt={s.label} className="aspect-[16/9] w-full object-cover" />
                <span className="block px-2 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">{s.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
