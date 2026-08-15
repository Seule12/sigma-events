"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { ticketPngFilename } from "@/lib/ticket-ref";

export type PngTicket = { code: string; guestName: string };

// Nombre max de billets exportés d'un coup (le navigateur limite les téléchargements
// multiples — au-delà, privilégier l'impression PDF).
const BATCH_LIMIT = 60;

// Capture une carte de billet (data-ticket-card) en PNG haute résolution (3×),
// avec fond blanc et ombre retirée pendant la capture. Le facteur 3 rend une
// image plus large et nette (carte ~384px → ~1150px), idéale pour l'impression
// ou le partage sans perte de qualité.
// Largeur du billet exporté (px) : indépendante de la taille de la fenêtre du
// navigateur — le PNG reste large même si l'écran est étroit. 512 px → ~1536 px à 3×.
const EXPORT_WIDTH_PX = 512;

async function captureTicketPng(card: HTMLElement): Promise<string | null> {
  const prevShadow = card.style.boxShadow;
  const prevWidth = card.style.width;
  card.style.boxShadow = "none";
  // Largeur fixe au moment de la capture (la carte est `w-full max-w-lg` : sur un
  // petit écran elle serait capturée plus étroite que sa largeur maximale).
  card.style.width = `${EXPORT_WIDTH_PX}px`;
  // Les encoches du talon sont grises à l'écran (bg-slate-100) et blanches en
  // impression (print:bg-white). Le media print ne s'applique pas à la capture
  // html-to-image : on force le blanc pendant la capture, comme pour l'ombre.
  const notches = Array.from(card.querySelectorAll<HTMLElement>(".ticket-notch"));
  const prevNotchBg = notches.map((n) => n.style.backgroundColor);
  notches.forEach((n) => (n.style.backgroundColor = "#ffffff"));
  // Le QR est généré côté client (<LazyQr />) : on attend que toutes les images
  // de la carte (QR, logo) soient décodées avant la capture, sinon l'export PNG
  // capturerait le placeholder gris animé à la place du QR réel.
  try {
    await Promise.all(
      Array.from(card.querySelectorAll("img")).map((img) =>
        img.complete ? Promise.resolve() : img.decode().catch(() => {})
      )
    );
    return await toPng(card, {
      pixelRatio: 3,
      backgroundColor: "#ffffff",
      cacheBust: true,
      style: { borderRadius: "1.5rem" },
    });
  } catch {
    return null;
  } finally {
    card.style.boxShadow = prevShadow;
    card.style.width = prevWidth;
    notches.forEach((n, i) => (n.style.backgroundColor = prevNotchBg[i] ?? ""));
  }
}

function downloadPng(dataUrl: string, filename: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// La carte de billet est repérée par son ordre dans le DOM (data-ticket-card) :
// l'index du tableau tickets correspond à la position de la carte dans la grille.
function findCard(index: number): HTMLElement | null {
  const cards = document.querySelectorAll<HTMLElement>("[data-ticket-card]");
  return cards[index] ?? null;
}

// ===== Bouton d'export d'UN billet (apposé sur chaque carte) =====
export function TicketPngButton({ index, code, guestName }: PngTicket & { index: number }) {
  const [busy, setBusy] = useState(false);

  const onExport = async () => {
    const card = findCard(index);
    if (!card || busy) return;
    setBusy(true);
    const dataUrl = await captureTicketPng(card);
    if (dataUrl) downloadPng(dataUrl, ticketPngFilename(code, guestName));
    setBusy(false);
  };

  return (
    <button
      type="button"
      onClick={onExport}
      disabled={busy}
      title="Télécharger ce billet en PNG"
      aria-label="Télécharger ce billet en PNG"
      className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm transition hover:border-brand-500 hover:text-brand-600 disabled:opacity-50 print:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-brand-500"
    >
      {busy ? (
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
      ) : (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
      )}
      PNG
    </button>
  );
}

// ===== Export de TOUS les billets en PNG (avec progression) =====
export function TicketPngExport({ tickets }: { tickets: PngTicket[] }) {
  const [state, setState] = useState<{ done: number; total: number } | null>(null);
  const busyRef = useRef(false);

  const onExportAll = async () => {
    if (busyRef.current) return;
    const list = tickets.slice(0, BATCH_LIMIT);
    busyRef.current = true;
    setState({ done: 0, total: list.length });
    for (let i = 0; i < list.length; i++) {
      const card = findCard(i);
      const dataUrl = card ? await captureTicketPng(card) : null;
      if (dataUrl) downloadPng(dataUrl, ticketPngFilename(list[i].code, list[i].guestName));
      setState({ done: i + 1, total: list.length });
      // Laisse le navigateur traiter les téléchargements successifs.
      await new Promise((r) => setTimeout(r, 350));
    }
    busyRef.current = false;
    setState(null);
  };

  const exporting = state !== null;

  return (
    <div className="flex flex-col items-end gap-1 print:hidden">
      <button
        type="button"
        onClick={onExportAll}
        disabled={exporting || tickets.length === 0}
        title="Télécharger chaque billet en PNG"
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
      >
        {exporting ? (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
        ) : (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
        )}
        {exporting ? `Export PNG ${state?.done}/${state?.total}…` : `Tout exporter en PNG`}
      </button>
      {tickets.length > BATCH_LIMIT && !exporting && (
        <p className="text-[11px] text-slate-400">
          {tickets.length} billets : les {BATCH_LIMIT} premiers seront téléchargés — pour une liste plus
          grande, utilisez l&apos;impression PDF.
        </p>
      )}
    </div>
  );
}
