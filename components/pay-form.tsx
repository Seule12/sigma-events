"use client";

import { useState } from "react";
import { simulatePaymentAction } from "@/app/actions";
import { MOMO_NETWORKS } from "@/lib/momo";
import { displayPhone } from "@/lib/format";

export type DeliveryChoice = "DOWNLOAD" | "EMAIL" | "WHATSAPP";

// Le choix du canal détermine seulement COMMENT le billet est reçu (les frais
// de service ne sont pas affichés au client).
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
  const [step, setStep] = useState<"idle" | "requesting" | "confirmed">("idle");
  const network = MOMO_NETWORKS.find((n) => n.id === networkId) ?? MOMO_NETWORKS[0];
  const deliveryOption = DELIVERY_OPTIONS.find((d) => d.id === delivery) ?? DELIVERY_OPTIONS[2];

  const handleClick = () => {
    if (step !== "idle") return;
    setStep("requesting");
    // Simule la demande USSD (le client reçoit la notification sur son téléphone)
    setTimeout(() => setStep("confirmed"), 2200);
  };

  if (step === "requesting") {
    return (
      <div className="animate-fade-up rounded-2xl border border-brand-200 bg-brand-50 p-6 text-center dark:border-brand-800 dark:bg-brand-950/40">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        <p className="text-sm font-bold text-brand-700 dark:text-brand-300">Paiement en cours…</p>
        <p className="mt-1 text-xs text-brand-600/80 dark:text-brand-400/80">
          Composez <b className="font-mono">{network.ussd}</b> sur le {displayPhone(phone)} et confirmez la demande.
        </p>
      </div>
    );
  }

  if (step === "confirmed") {
    return (
      <form action={simulatePaymentAction}>
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="network" value={network.id} />
        <input type="hidden" name="delivery" value={delivery} />
        <div className="animate-fade-up mb-4 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" /></svg>
          Réception : <b>{deliveryOption.title}</b> — le billet vous sera envoyé après validation.
        </div>
        <button
          type="submit"
          autoFocus
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-4 text-base font-bold text-white shadow-xl shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-2xl"
        >
          Paiement reçu — valider
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
        </button>
      </form>
    );
  }

  return (
    <div className="space-y-4">
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
        <p className="mt-2 text-xs text-slate-400">{network.hint} · composez {network.ussd} pour payer</p>
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
                    ? "border-brand-600 bg-brand-50 shadow-lg shadow-brand-600/10 dark:border-brand-500 dark:bg-brand-950/40"
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
        <p className="mt-2 text-xs text-slate-400">
          Le billet vous est remis par le canal de votre choix.
        </p>
      </div>

      <button
        type="button"
        onClick={handleClick}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-600 to-brand-700 px-6 py-4 text-base font-bold text-white shadow-xl shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-2xl"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
        Payer avec {network.name}
      </button>
    </div>
  );
}
