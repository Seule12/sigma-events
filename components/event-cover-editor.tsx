"use client";

import { useState } from "react";
import CoverSuggestionPicker from "@/components/cover-suggestion-picker";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

// Bloc « Image de couverture » du formulaire d'édition : URL + import + aperçu +
// suggestions selon le type d'événement (mêmes règles que le formulaire de création).
export default function EventCoverEditor({
  initialType,
  initialImageUrl,
}: {
  initialType: string;
  initialImageUrl: string;
}) {
  const [type, setType] = useState(initialType);
  const [imageUrl, setImageUrl] = useState(initialImageUrl);

  return (
    <div className="sm:col-span-2 space-y-3">
      <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Type (concert, mariage…)</label>
      <input name="type" value={type} onChange={(e) => setType(e.target.value)} placeholder="Concert" className={inputClass} />

      <div>
        <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Image de couverture</label>
        <div className="flex gap-2">
          <input name="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" className={inputClass} />
          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
            Importer
            <input type="file" name="imageFile" accept="image/*" className="hidden" />
          </label>
        </div>
        {imageUrl && (
          <div className="relative mt-2 h-20 w-32 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="Aperçu" className="h-full w-full object-cover" />
          </div>
        )}
        <p className="mt-1.5 text-xs text-slate-400">Affichée en haut de la boutique et sur le billet.</p>
      </div>

      <CoverSuggestionPicker type={type} value={imageUrl} onChange={setImageUrl} />
    </div>
  );
}
