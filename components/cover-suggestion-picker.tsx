"use client";

import { useEffect, useState } from "react";
import { coverSuggestions, allCategories, categoryImages } from "@/lib/cover-suggestions";

// Sélecteur de couverture enrichi :
// - Onglets par catégorie (15 catégories, ~160 images)
// - 3 variations SVG gradient par catégorie
// - Filtrage par type saisi + navigation par catégorie
// - Images Unsplash (1600×900) avec thumbnails (640×360)
export default function CoverSuggestionPicker({
  type,
  value,
  onChange,
}: {
  type: string;
  value: string;
  onChange: (url: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<"auto" | string>("auto");
  const [showAll, setShowAll] = useState(false);

  // Suggestions auto basées sur le type saisi
  const autoSuggestions = type.trim().length >= 3 ? coverSuggestions(type) : [];
  const svgAuto = autoSuggestions.filter((s) => s.url.startsWith("data:"));
  const imagesAuto = autoSuggestions.filter((s) => !s.url.startsWith("data:"));

  // Suggestions de la catégorie active (onglet)
  const categories = allCategories();
  const activeImages = activeTab !== "auto" ? categoryImages(activeTab) : [];

  // Basculer entre onglets
  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    setShowAll(true);
  };

  return (
    <div className="space-y-4">
      {/* Onglets catégories */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => { setActiveTab("auto"); setShowAll(false); }}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
            activeTab === "auto" && !showAll
              ? "bg-brand-600 text-white shadow-lg shadow-brand-600/25"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          Auto (par type)
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => handleTabChange(cat.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              activeTab === cat.id
                ? "bg-brand-600 text-white shadow-lg shadow-brand-600/25"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {cat.label} ({cat.count})
          </button>
        ))}
      </div>

      {/* Mode Auto : suggestions par type saisi */}
      {activeTab === "auto" && !showAll && (
        <>
          {/* SVG gradient */}
          {svgAuto.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                Couvertures générées automatiquement
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {svgAuto.map((s) => (
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

          {/* Images auto */}
          {imagesAuto.length > 0 && (
            <div>
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" /></svg>
                Images pour « {type.trim()} »
              </p>
              <ImageGrid images={imagesAuto} value={value} onChange={onChange} />
            </div>
          )}

          {autoSuggestions.length === 0 && (
            <p className="py-4 text-center text-sm text-slate-400">
              Tapez le type de votre événement (concert, mariage…) pour voir les suggestions.
            </p>
          )}
        </>
      )}

      {/* Mode catégorie : toutes les images d'une catégorie */}
      {activeTab !== "auto" && (
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {categories.find((c) => c.id === activeTab)?.label} — {activeImages.length} images
          </p>
          <ImageGrid images={activeImages} value={value} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

// Grille d'images réutilisable
function ImageGrid({
  images,
  value,
  onChange,
}: {
  images: Array<{ label: string; url: string }>;
  value: string;
  onChange: (url: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {images.map((s) => (
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
  );
}
