"use client";

import { useState } from "react";
import { createOrderAction } from "@/app/actions";
import { formatFcfa } from "@/lib/format";
import { grossUpFedaPay, DELIVERY_FEE } from "@/lib/pricing";

type Category = { id: string; name: string; price: number; capacity: number; sold: number };

export default function BuyTicketForm({
  eventId,
  categories,
  error,
  maxPerCustomer = 10,
}: {
  eventId: string;
  categories: Category[];
  error?: string | null;
  maxPerCustomer?: number;
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [phone, setPhone] = useState("");
  const [quantity, setQuantity] = useState(1);

  const selected = categories.find((c) => c.id === categoryId) ?? categories[0];
  const remaining = selected ? Math.max(0, selected.capacity - selected.sold) : 0;
  // Limite d'achat de l'événement (maxPerCustomer) ∩ places restantes ∩ plafond global (10).
  const maxQty = Math.max(1, Math.min(remaining || 1, maxPerCustomer || 10, 10));
  const qty = Math.max(1, Math.min(quantity, maxQty));
  const total = (selected?.price ?? 0) * qty;
  // Prix tout compris : billets + frais de service (50 F), commission intégrée
  // par gross-up — le client paie un montant unique, sans breakdown.
  const totalAllIncluded = total > 0 ? grossUpFedaPay(total + DELIVERY_FEE) : 0;

  const selectCategory = (id: string) => {
    setCategoryId(id);
    setQuantity(1);
  };

  // Placeholder téléphone adapté au Bénin
  const phoneDigits = phone.replace(/\D/g, "");

  const errors: Record<string, string> = {
    SOLD_OUT: "Désolé, cette catégorie est complète. Choisissez-en une autre.",
    NOT_ENOUGH_SEATS: "Il ne reste pas assez de places pour cette quantité. Réduisez le nombre de billets.",
    CATEGORY_NOT_FOUND: "Type de billet introuvable. Rechargez la page.",
    EVENT_NOT_FOUND: "Événement introuvable.",
    SALES_CLOSED: "Les ventes en ligne sont fermées pour cet événement.",
    INVALID_INPUT: "Vérifiez vos informations (nom et téléphone valides).",
    RATE_LIMITED: "Trop de commandes pour ce numéro. Réessayez plus tard.",
  };

  return (
    <div>
      {error && errors[error] && (
        <div className="animate-fade-up mb-4 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
          {errors[error]}
        </div>
      )}

      <form action={createOrderAction} className="space-y-5">
        <input type="hidden" name="eventId" value={eventId} />
        <input type="hidden" name="quantity" value={qty} />

        {/* Choix du billet */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">Choisissez votre billet</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {categories.map((cat) => {
              const soldOut = cat.sold >= cat.capacity;
              const active = cat.id === categoryId;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => selectCategory(cat.id)}
                  disabled={soldOut}
                  className={`relative rounded-2xl border-2 p-4 text-left transition ${
                    soldOut
                      ? "cursor-not-allowed border-slate-100 opacity-50 dark:border-slate-800"
                      : active
                        ? "border-brand-600 bg-brand-50 shadow-lg shadow-brand-600/10 dark:border-brand-500 dark:bg-brand-950/40"
                        : "border-slate-200 bg-white hover:border-brand-400 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-700"
                  }`}
                >
                  {soldOut && (
                    <span className="absolute right-3 top-3 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
                      Complet
                    </span>
                  )}
                  <p className="font-bold text-slate-900 dark:text-white">{cat.name}</p>
                  <p className="mt-1 text-lg font-extrabold text-brand-600 dark:text-brand-400">
                    {cat.price > 0 ? formatFcfa(cat.price) : "Gratuit"}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {soldOut ? "Plus de places" : `${Math.max(0, cat.capacity - cat.sold)} places restantes`}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Quantité */}
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-300">
            Nombre de billets
            <span className="ml-2 font-normal text-slate-400">(max {maxQty})</span>
          </label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={qty <= 1 || remaining <= 0}
              aria-label="Retirer un billet"
              className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-lg font-extrabold text-slate-600 transition hover:border-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              −
            </button>
            <span className="grid h-11 w-16 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-lg font-extrabold text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white">
              {qty}
            </span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(maxQty, q + 1))}
              disabled={qty >= maxQty || remaining <= 0}
              aria-label="Ajouter un billet"
              className="grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-lg font-extrabold text-slate-600 transition hover:border-brand-500 hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              +
            </button>
            <p className="text-xs text-slate-400">
              Un billet QR par personne — présentez chaque QR à l&apos;entrée.
            </p>
          </div>
        </div>

        {/* Infos client */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="customerName" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Nom complet *</label>
            <input id="customerName" name="customerName" required placeholder="Ex : Aya Hounkpatin" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
          <div>
            <label htmlFor="customerPhone" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Téléphone (WhatsApp) *</label>
            <input
              id="customerPhone"
              name="customerPhone"
              required
              inputMode="tel"
              placeholder="97 00 00 00"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            {phoneDigits.length > 0 && phoneDigits.length < 8 && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">8 chiffres minimum (format béninois : 90, 91, 96, 97, 94, 66…)</p>
            )}
          </div>
          <div>
            <label htmlFor="customerEmail" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Email (pour la facture)</label>
            <input id="customerEmail" name="customerEmail" type="email" placeholder="aya@exemple.com" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-800 dark:text-white" />
          </div>
        </div>

        {/* Récapitulatif + paiement */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500 dark:text-slate-400">
              {selected ? `${selected.name} × ${qty}` : "—"}
            </span>
            <span className="font-semibold text-slate-700 dark:text-slate-200">
              {selected
                ? selected.price > 0
                  ? `${formatFcfa(selected.price)} × ${qty}`
                  : "Gratuit"
                : "—"}
            </span>
          </div>
          <div className="my-3 border-t border-dashed border-slate-200 dark:border-slate-700" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Total à payer</span>
            <span className="text-2xl font-extrabold text-brand-600 dark:text-brand-400">
              {selected ? (total > 0 ? formatFcfa(totalAllIncluded) : "0 FCFA") : "—"}
            </span>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            Paiement mobile money : MTN MoMo · Moov Money · Celtiis Cash
          </p>
        </div>

        <input type="hidden" name="categoryId" value={categoryId} />
        <button
          type="submit"
          disabled={!categoryId || remaining <= 0 || phoneDigits.length < 8}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-4 text-base font-bold text-white shadow-xl shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-2xl disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        >
          {total > 0 ? `Payer ${formatFcfa(totalAllIncluded)}` : "Obtenir mon billet gratuit"}
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
        </button>
      </form>
    </div>
  );
}
