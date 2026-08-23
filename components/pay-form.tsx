"use client";

import { useState } from "react";
import { simulatePaymentAction } from "@/app/actions";
import { MOMO_NETWORKS } from "@/lib/momo";

export type DeliveryChoice = "DOWNLOAD" | "EMAIL" | "WHATSAPP";

const DELIVERY_OPTIONS: Array<{ id: DeliveryChoice; icon: React.ReactNode; title: string; desc: string }> = [
  {
    id: "DOWNLOAD",
    icon: (
      <svg className="h-5 w-5 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
    ),
    title: "Télécharger",
    desc: "Le billet s'affiche ici, vous le gardez sur votre téléphone",
  },
  {
    id: "EMAIL",
    icon: (
      <svg className="h-5 w-5 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
    ),
    title: "Recevoir par email",
    desc: "Le billet vous est envoyé sur votre boîte mail",
  },
  {
    id: "WHATSAPP",
    icon: (
      <svg className="h-5 w-5 text-slate-500 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
    ),
    title: "Recevoir sur WhatsApp",
    desc: "Le billet arrive directement sur votre WhatsApp",
  },
];

export default function PayForm({ orderId, phone }: { orderId: string; phone: string }) {
  const [networkId, setNetworkId] = useState(MOMO_NETWORKS[0].id);
  const [delivery, setDelivery] = useState<DeliveryChoice>("WHATSAPP");
  const [busy, setBusy] = useState(false);
  const network = MOMO_NETWORKS.find((n) => n.id === networkId) ?? MOMO_NETWORKS[0];

  return (
    <form
      action={simulatePaymentAction}
      className="space-y-4"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="network" value={networkId} />
      <input type="hidden" name="delivery" value={delivery} />

      {/* Choix du réseau mobile money */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">1. Choisissez votre réseau</p>
        <div className="grid grid-cols-2 gap-2">
          {MOMO_NETWORKS.map((n) => {
            const active = n.id === networkId;
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setNetworkId(n.id)}
                aria-pressed={active}
                className={`rounded-xl border-2 p-3 text-left transition ${
                  active
                    ? "border-brand-600 bg-brand-50 shadow-lg shadow-brand-600/10 dark:border-brand-500 dark:bg-brand-950/40"
                    : "border-slate-200 bg-white hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${n.dot} text-[8px] font-extrabold uppercase leading-none text-slate-900`}>
                    {n.short}
                  </span>
                  <p className="truncate text-sm font-bold text-slate-900 dark:text-white">{n.short}</p>
                </div>
                <p className="mt-1 font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{n.ussd}</p>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-400">{network.hint} · vous serez redirigé(e) vers FeexPay</p>
      </div>

      {/* Choix du mode de réception du billet */}
      <div>
        <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">2. Comment recevoir votre billet ?</p>
        <div className="space-y-2">
          {DELIVERY_OPTIONS.map((d) => {
            const active = d.id === delivery;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setDelivery(d.id)}
                aria-pressed={active}
                className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition ${
                  active
                    ? "border-brand-600 bg-brand-50 shadow-lg shadow-brand-600/10 dark:border-brand-800 dark:bg-brand-950/40"
                    : "border-slate-200 bg-white hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-700"
                }`}
              >
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? "bg-brand-100 dark:bg-brand-900" : "bg-slate-100 dark:bg-slate-800"}`}>{d.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900 dark:text-white">{d.title}</span>
                  <span className="block text-[11px] leading-snug text-slate-400">{d.desc}</span>
                </span>
                <span className="shrink-0 grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="submit"
        disabled={busy}
        onClick={() => setBusy(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-4 text-base font-bold text-white shadow-xl shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-2xl disabled:opacity-60"
      >
        {busy ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            Redirection en cours…
          </>
        ) : (
          <>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
            Payer avec {network.name}
          </>
        )}
      </button>
    </form>
  );
}
