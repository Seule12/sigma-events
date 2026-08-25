"use client";

import { useEffect, useState } from "react";
import { coverSuggestions, unsplashSuggestions } from "@/lib/cover-suggestions";

// Sélecteur de couverture suggérée selon le type d'événement :
// - 3 variations SVG gradient (toujours disponibles, aucune dépendance)
// - Images Unsplash correspondantes (chargées depuis le CDN)
// L'organisateur peut reprendre une suggestion, ou coller/importer sa propre URL.
export default function CoverSuggestionPicker({
  type,
  value,
  onChange,
}: {
  type: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [allSuggestions, setAllSuggestions] = useState(() =>
    type.trim().length >= 3 ? coverSuggestions(type) : []
  );

  // Recalcule les suggestions quand le type saisi change.
  useEffect(() => {
    setAllSuggestions(type.trim().length >= 3 ? coverSuggestions(type) : []);
  }, [type]);

  const svgSuggestions = allSuggestions.filter((s) => s.url.startsWith("data:"));
  const unsplashList = allSuggestions.filter((s) => !s.url.startsWith("data:"));

  return (
    <div className="space-y-4">
      {/* Images Unsplash */}
      {unsplashList.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
            Images recommandées pour « {type.trim()} »
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {unsplashList.map((s) => (
              <button
                key={s.url}
                type="button"
                onClick={() => onChange(s.url)}
                aria-pressed={value === s.url}
                className={`group relative overflow-hidden rounded-xl border-2 text-left transition ${
                  value === s.url
                    ? "border-brand-600 ring-2 ring-brand-600/30 dark:border-brand-500"
                    : "border-slate-200 hover:border-brand-400 dark:border-slate-700 dark:hover:border-brand-700"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.url}
                  alt={s.label}
                  loading="lazy"
                  className="aspect-[16/9] w-full object-cover transition group-hover:scale-105"
                />
                {value === s.url && (
                  <div className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-white shadow">
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  </div>
                )}
                <span className="block truncate px-2 py-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  {s.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions SVG gradient */}
      {svgSuggestions.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Couvertures générées automatiquement
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {svgSuggestions.map((s) => (
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
        </div>
      )}
    </div>
  );
}
