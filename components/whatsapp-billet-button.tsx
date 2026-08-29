"use client";

import { useState } from "react";

/**
 * Bouton "Recevoir mon billet sur WhatsApp".
 *
 * Flow :
 *   1. Le client clique → ouvre wa.me avec un message pré-rempli contenant sa référence
 *   2. Le client envoie le message → le webhook détecte la référence
 *   3. Le système trouve le billet → génère le PNG → l'envoie en réponse
 *   4. Si pas de message après 5 min → envoi automatique du billet
 *
 * Props :
 *   - orderId : ID de la commande (pour tracker l'envoi en attente)
 *   - phone : numéro WhatsApp du client
 *   - reference : référence de la commande (ex: "SIGMA-ABC123")
 *   - eventName : nom de l'événement (pour le message pré-rempli)
 *   - guestName : nom du client (pour le message pré-rempli)
 *   - fullWidth : si true, prend toute la largeur disponible
 */

type Props = {
  orderId: string;
  phone: string;
  reference: string;
  eventName: string;
  guestName: string;
  fullWidth?: boolean;
};

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("229")) return digits;
  if (digits.startsWith("01")) return `229${digits}`;
  return `229${digits}`;
}

export default function WhatsAppBilletButton({
  phone,
  reference,
  eventName,
  guestName,
  fullWidth = false,
}: Props) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const handleWriteFirst = () => {
    setSending(true);

    // Message pré-rempli avec la référence
    const message = `Bonjour, je souhaite recevoir mon billet pour *${eventName}*.\n\nMa référence : ${reference}\nNom : ${guestName}`;
    const digits = toE164(phone);
    const waUrl = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;

    // Ouvrir WhatsApp
    window.open(waUrl, "_blank");
    setSent(true);
    setSending(false);
  };

  if (sent) {
    return (
      <div className={`rounded-2xl bg-green-50 p-4 text-center dark:bg-green-950/30 ${fullWidth ? "w-full" : ""}`}>
        <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-green-100 dark:bg-green-900/30">
          <svg className="h-5 w-5 text-green-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <p className="text-sm font-bold text-green-800 dark:text-green-300">
          WhatsApp ouvert !
        </p>
        <p className="mt-1 text-xs text-green-600 dark:text-green-400">
          Envoyez le message avec votre référence. Votre billet vous sera envoyé automatiquement.
        </p>
        <div className="mt-3 flex items-center justify-center gap-1 text-xs text-green-500">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
          En attente de votre message...
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleWriteFirst}
      disabled={sending}
      className={`group flex items-center justify-center gap-3 rounded-2xl bg-[#25D366] py-4 text-base font-bold text-white shadow-lg shadow-green-600/20 transition hover:-translate-y-0.5 hover:brightness-105 active:scale-[0.98] disabled:opacity-60 ${
        fullWidth ? "w-full" : ""
      }`}
    >
      {sending ? (
        <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      ) : (
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" />
        </svg>
      )}
      {sending ? "Ouverture de WhatsApp..." : "Recevoir mon billet sur WhatsApp"}
    </button>
  );
}
