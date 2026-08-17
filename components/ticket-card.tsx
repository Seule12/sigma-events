import { ticketRef } from "@/lib/ticket-ref";
import { displayPhone } from "@/lib/format";
import { ticketQrContent } from "@/lib/qr";
import LazyQr from "@/components/lazy-qr";
import CoverImage from "@/components/cover-image";

// Carte de billet officielle — design « Billet SIGMA » (vertical, format carte).
// Utilisée pour l'export organisateur (page /events/[id]/billets).
// Composant serveur : le QR est généré côté client (<LazyQr eager />) pour ne
// jamais bloquer le rendu serveur — un prop `qr` en data-URL reste accepté en fallback.

type TicketCardProps = {
  id: string;
  eventId: string;
  code: string;
  guestName: string;
  guestPhone?: string | null;
  guestCount?: number;
  categoryName?: string | null;
  categoryColor?: string | null;
  eventName: string;
  eventLocation: string;
  eventDate: Date;
  doorsOpen?: string | null;
  organizerName?: string | null;
  /** Image de couverture de l'événement (affichée en bannière en haut du billet). */
  imageUrl?: string | null;
  qr?: string | null;
};



function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// +229 XX XX XX XX (ou l'indicatif du pays — ouverture Afrique).
function formatPhone(phone?: string | null): string {
  if (!phone) return "Non renseigné";
  return displayPhone(phone);
}

export default function TicketCard({
  id,
  eventId,
  code,
  guestName,
  guestPhone,
  guestCount = 1,
  categoryName,
  categoryColor,
  eventName,
  eventLocation,
  eventDate,
  doorsOpen,
  organizerName,
  imageUrl,
  qr,
}: TicketCardProps) {
  const access = guestCount > 1 ? `Titulaire + ${guestCount - 1} personne(s)` : "Titulaire";
  const badgeColor = categoryColor ?? "#f59e0b";

  return (
    <div
      data-ticket-card
      className="mx-auto w-full max-w-lg break-inside-avoid rounded-3xl bg-white shadow-2xl ring-1 ring-slate-200 print:mx-auto print:shadow-none print:ring-slate-300"
      style={{ pageBreakInside: "avoid" }}
    >
      {/* ===== Image de couverture de l'événement (bannière en haut du billet) ===== */}
      {imageUrl && (
        <div className="relative h-36 w-full overflow-hidden rounded-t-3xl bg-gradient-to-br from-brand-700 via-brand-800 to-slate-900">
          <CoverImage src={imageUrl} alt={eventName} />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        </div>
      )}

      {/* ===== En-tête : dégradé sombre → vert ===== */}
      <div
        className={`bg-gradient-to-b from-slate-950 via-teal-950 to-emerald-900 px-6 pb-7 pt-5 text-white ${
          imageUrl ? "" : "rounded-t-3xl"
        }`}
      >
        <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
          {/* Logo officiel (sur l'en-tête sombre du billet — le S blanc ressort) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/sigma-logo.png" alt="Sigma Events" width={22} height={19} className="h-[19px] w-[22px] shrink-0 rounded bg-slate-950 object-contain" />
          Sigma Events • Billet officiel
        </p>
        <h1 className="mt-3 text-xl font-extrabold leading-snug">{eventName}</h1>
        <p className="mt-2.5 flex items-center gap-1.5 text-sm text-white/90">
          <svg className="h-4 w-4 shrink-0 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {eventLocation}
        </p>
        <p className="mt-1.5 text-xs text-emerald-200/70">
          Organisé par : {organizerName || "Organisateur"}
        </p>
      </div>

      {/* ===== Corps blanc : QR + référence ===== */}
      <div className="px-6 pb-5 pt-6">
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR code du billet ${guestName}`} className="mx-auto h-44 w-44 rounded-lg bg-white" />
          ) : (
            <LazyQr
              content={ticketQrContent({ id, eventId, code, guestCount })}
              size={176}
              eager
              className="mx-auto h-44 w-44 rounded-lg bg-white"
            />
          )}
        </div>
        <p className="mt-3 text-center font-mono text-sm font-bold tracking-wide text-slate-700">#{ticketRef(code)}</p>

        {/* ===== Talon découpé ===== */}
        <div className="relative my-5">
          <div className="border-t-2 border-dashed border-slate-300" />
          <div className="ticket-notch absolute -left-3 -top-3 h-6 w-6 rounded-full bg-slate-100 print:bg-white" />
          <div className="ticket-notch absolute -right-3 -top-3 h-6 w-6 rounded-full bg-slate-100 print:bg-white" />
        </div>

        {/* ===== Titulaire + catégorie ===== */}
        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Titulaire du billet</p>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <p className="text-lg font-extrabold text-slate-900">{guestName}</p>
          {categoryName && (
            <span
              className="shrink-0 rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white"
              style={{ backgroundColor: badgeColor }}
            >
              {categoryName}
            </span>
          )}
        </div>

        {/* ===== Grille d'informations ===== */}
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 rounded-2xl bg-slate-50 p-4">
          <div className="flex items-start gap-2.5">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
            </svg>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Date de l&apos;événement</p>
              <p className="mt-0.5 text-sm font-bold text-slate-800">{formatDate(eventDate)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Heure d&apos;ouverture</p>
              <p className="mt-0.5 text-sm font-bold text-slate-800">{doorsOpen || formatTime(eventDate)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Accès autorisé</p>
              <p className="mt-0.5 text-sm font-bold text-slate-800">{access}</p>
            </div>
          </div>
          <div className="flex items-start gap-2.5">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Téléphone titulaire</p>
              <p className="mt-0.5 text-sm font-bold text-slate-800">{formatPhone(guestPhone)}</p>
            </div>
          </div>
        </div>

        {/* ===== Bandeau d'authenticité ===== */}
        <div className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
          <svg className="h-4 w-4 shrink-0 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <p className="text-center text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">
            Pass d&apos;accès authentifié et sécurisé par Sigma Events Bénin
          </p>
        </div>

        {/* ===== Mentions ===== */}
        <p className="mt-4 text-center text-[9px] leading-relaxed text-slate-400">
          Présentez ce QR code sur votre écran ou imprimé à l&apos;entrée. Un seul scan autorisé.
        </p>
        <p className="mt-1 text-center text-[9px] leading-relaxed text-slate-400">
          Système anti-falsification cryptographique • Tous droits réservés SIGMA 2026
        </p>
      </div>
    </div>
  );
}
