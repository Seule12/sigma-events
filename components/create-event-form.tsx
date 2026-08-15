"use client";

import { useEffect, useState } from "react";
import { createEventAction } from "@/app/actions";

type CategoryRow = { name: string; price: string; capacity: string; zones: string };

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

export default function CreateEventForm() {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryRow[]>([
    { name: "Standard", price: "5000", capacity: "", zones: "" },
    { name: "VIP", price: "15000", capacity: "", zones: "" },
  ]);

  // Ouvre le formulaire quand on arrive via le bouton « Nouvel événement » (#create-event)
  useEffect(() => {
    const openIfTargeted = () => {
      if (window.location.hash === "#create-event") setOpen(true);
    };
    openIfTargeted();
    window.addEventListener("hashchange", openIfTargeted);
    return () => window.removeEventListener("hashchange", openIfTargeted);
  }, []);

  const updateCategory = (i: number, field: keyof CategoryRow, value: string) => {
    setCategories((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)));
  };

  const addCategory = () => setCategories((prev) => [...prev, { name: "", price: "", capacity: "", zones: "" }]);
  const removeCategory = (i: number) => setCategories((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <section
      id="create-event"
      className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={open}
          aria-controls="create-event-form"
          className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-brand-300 bg-brand-50/50 px-4 py-8 text-base font-bold text-brand-700 transition hover:-translate-y-0.5 hover:border-brand-400 hover:bg-brand-50 dark:border-brand-800 dark:bg-brand-950/30 dark:text-brand-300 dark:hover:border-brand-700 dark:hover:bg-brand-950/50"
        >
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
          Créer un événement
        </button>
      ) : (
        <div id="create-event-form">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Créer un événement</h2>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                if (window.location.hash === "#create-event") {
                  history.replaceState(null, "", window.location.pathname + window.location.search);
                }
              }}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
              aria-label="Fermer le formulaire"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">
            La capacité sert de jauge : quand elle est atteinte, les entrées sont refusées automatiquement.
          </p>
          <form action={createEventAction} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Nom de l&apos;événement *</label>
              <input id="name" name="name" required placeholder="Concert, mariage, salon…" className={inputCls} />
            </div>
            <div>
              <label htmlFor="type" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Type</label>
              <input id="type" name="type" placeholder="Concert, mariage…" className={inputCls} />
            </div>
            <div>
              <label htmlFor="location" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Lieu *</label>
              <input id="location" name="location" required placeholder="Ex : Palais des Congrès" className={inputCls} />
            </div>
            <div>
              <label htmlFor="date" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Date et heure *</label>
              <input id="date" name="date" type="datetime-local" required className={`${inputCls} [color-scheme:light] dark:[color-scheme:dark]`} />
            </div>
            <div>
              <label htmlFor="endDate" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Fin (optionnel)</label>
              <input id="endDate" name="endDate" type="datetime-local" title="Fin de l'événement — par défaut : début + 8 h" className={`${inputCls} [color-scheme:light] dark:[color-scheme:dark]`} />
            </div>
            <div>
              <label htmlFor="capacity" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Capacité maximale *</label>
              <input id="capacity" name="capacity" type="number" min="1" required placeholder="1000" className={inputCls} />
            </div>
            <div>
              <label htmlFor="status" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Statut</label>
              <select id="status" name="status" className={inputCls}>
                <option value="LIVE">Annoncé (boutique ouverte)</option>
                <option value="DRAFT">Brouillon (boutique cachée)</option>
              </select>
            </div>

            {/* Mode d'accès : billetterie / invitations / combiné */}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Comment les personnes accèdent-elles ?</label>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {[
                  {
                    id: "PUBLIC",
                    title: "Billetterie publique",
                    desc: "Les participants achètent leur billet en ligne",
                    icon: (
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
                    ),
                  },
                  {
                    id: "INVITE",
                    title: "Invitations privées",
                    desc: "Vous créez la liste d'invités, aucun paiement",
                    icon: (
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M9 5v2M9 17v2" /></svg>
                    ),
                  },
                  {
                    id: "COMBINED",
                    title: "Billetterie + invités",
                    desc: "Une partie vendue, une partie invitée",
                    icon: (
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M9 5v2M9 17v2" /></svg>
                    ),
                  },
                ].map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-start gap-2.5 rounded-xl border-2 border-slate-200 p-3 transition has-[:checked]:border-brand-600 has-[:checked]:bg-brand-50 has-[:checked]:shadow-lg has-[:checked]:shadow-brand-600/10 hover:border-brand-300 dark:border-slate-700 dark:has-[:checked]:border-brand-500 dark:has-[:checked]:bg-brand-950/40 dark:hover:border-brand-700"
                  >
                    <input type="radio" name="mode" value={m.id} defaultChecked={m.id === "PUBLIC"} className="peer sr-only" />
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{m.icon}</span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold text-slate-900 dark:text-white">{m.title}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{m.desc}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Le mode « Invitations » masque la boutique : vos invités reçoivent une invitation nominative avec QR.
              </p>
            </div>

            {/* Zones d'accès (accréditations) */}
            <div className="sm:col-span-2">
              <label htmlFor="zones" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">
                Zones d&apos;accès <span className="font-normal text-slate-400">(optionnel)</span>
              </label>
              <input
                id="zones"
                name="zones"
                placeholder="main, vip, backstage, parking"
                className={inputCls}
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Vos zones de contrôle (accréditations) : staff, presse, VIP, backstage… Séparez-les par des virgules.
                Chaque porte (terminal) et chaque type de billet peut ensuite être limité à une zone.
              </p>
            </div>

            {/* Présentation & infos pratiques */}
            <div className="sm:col-span-2">
              <label htmlFor="description" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Description (affichée sur la boutique)</label>
              <textarea
                id="description"
                name="description"
                rows={3}
                placeholder="Présentez votre événement aux visiteurs…"
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2 space-y-3">
              <label className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Image de couverture</label>
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <input 
                    id="imageUrl" 
                    name="imageUrl" 
                    placeholder="https://..." 
                    className={inputCls} 
                  />
                  <label className="cursor-pointer whitespace-nowrap rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
                    Importer
                    <input type="file" name="imageFile" accept="image/*" className="hidden" />
                  </label>
                </div>
                <p className="text-xs text-slate-400">Affichée en haut de la boutique et sur le billet.</p>
              </div>
            </div>
            <div>
              <label htmlFor="doorsOpen" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Ouverture des portes</label>
              <input id="doorsOpen" name="doorsOpen" type="time" className={`${inputCls} [color-scheme:light] dark:[color-scheme:dark]`} />
            </div>
            <div>
              <label htmlFor="maxPerCustomer" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Billets max par client</label>
              <input id="maxPerCustomer" name="maxPerCustomer" type="number" min="1" max="10" defaultValue="10" className={inputCls} />
            </div>
            <div>
              <label htmlFor="contactName" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Contact (nom)</label>
              <input id="contactName" name="contactName" placeholder="Votre nom" className={inputCls} />
            </div>
            <div>
              <label htmlFor="contactPhone" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Contact (téléphone WhatsApp)</label>
              <input id="contactPhone" name="contactPhone" placeholder="97 00 00 00" className={inputCls} />
            </div>
            <div className="sm:col-span-2">
              <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                <input type="checkbox" name="salesAtDoor" value="1" defaultChecked className="h-4 w-4 accent-brand-600" />
                Vente à la porte autorisée (la boutique reste ouverte pendant l&apos;événement)
              </label>
            </div>

            {/* Catégories de billets (vente en ligne) */}
            <div className="sm:col-span-2">
              <div className="mb-1.5 flex items-center justify-between">
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Billets en vente (prix en FCFA)
                </label>
                <button
                  type="button"
                  onClick={addCategory}
                  className="flex items-center gap-1 rounded-lg border border-brand-200 px-2.5 py-1 text-xs font-bold text-brand-600 transition hover:bg-brand-50 dark:border-brand-800 dark:text-brand-400 dark:hover:bg-brand-950"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  Ajouter un type
                </button>
              </div>
              <p className="mb-3 text-xs text-slate-400">
                Ces catégories alimentent la boutique en ligne. Le lien d&apos;achat est généré automatiquement après la création.
              </p>
              <div className="space-y-2">
                {categories.map((cat, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[130px] flex-1">
                      <input
                        name="catName"
                        placeholder="Nom (ex : VIP)"
                        value={cat.name}
                        onChange={(e) => updateCategory(i, "name", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="w-32">
                      <input
                        name="catPrice"
                        type="number"
                        min="0"
                        placeholder="Prix FCFA"
                        value={cat.price}
                        onChange={(e) => updateCategory(i, "price", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="w-32">
                      <input
                        name="catCapacity"
                        type="number"
                        min="1"
                        placeholder="Places"
                        value={cat.capacity}
                        onChange={(e) => updateCategory(i, "capacity", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className="w-36">
                      <input
                        name="catZones"
                        placeholder="Zones (opt.)"
                        title="Zones autorisées pour ce billet (accréditation), séparées par des virgules. Vide = toutes les zones."
                        value={cat.zones}
                        onChange={(e) => updateCategory(i, "zones", e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    {categories.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeCategory(i)}
                        title="Retirer ce type"
                        className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-400 transition hover:bg-red-100 hover:text-red-600 dark:bg-slate-800 dark:hover:bg-red-950"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-400">
                <b>Zones (accréditations)</b> : ex. une catégorie « Staff » avec zone « backstage » n&apos;entre qu&apos;aux portes
                autorisées pour cette zone. Vide = accès à toutes les zones.
              </p>
            </div>

            <div className="flex items-end gap-3 sm:col-span-2">
              <button type="submit" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-3 font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-xl sm:flex-none">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Créer l&apos;événement
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (window.location.hash === "#create-event") {
                    history.replaceState(null, "", window.location.pathname + window.location.search);
                  }
                }}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200"
              >
                Annuler
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
