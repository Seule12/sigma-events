// API : génère une image PNG du billet côté serveur.
// Utilisée par le flow WhatsApp pour envoyer le billet en image.
// Route : GET /api/tickets/[code]/image
//
// Approche : génère un SVG complet du billet puis le retourne comme image/svg+xml.
// WhatsApp accepte les images SVG, et la plupart des lecteurs d'images aussi.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import QRCode from "qrcode";
import { ticketQrContent } from "@/lib/qr";

export const dynamic = "force-dynamic";

function formatDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getHours()}:${pad(d.getMinutes())}`;
}

function escSvg(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;

  const decodedCode = decodeURIComponent(code);
  const ticket = await prisma.ticket.findFirst({
    where: {
      OR: [
        { code: decodedCode },
        { code: decodedCode.toUpperCase() },
        { code: decodedCode.toLowerCase() },
      ],
    },
    include: {
      event: {
        select: { name: true, date: true, location: true, imageUrl: true, organizer: { select: { name: true } } },
      },
      category: { select: { name: true, color: true } },
    },
  });

  if (!ticket) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const qrContent = ticketQrContent({
    id: ticket.id,
    eventId: ticket.eventId,
    code: ticket.code,
    guestCount: ticket.guestCount,
  });

  let qrDataUrl: string;
  try {
    qrDataUrl = await QRCode.toDataURL(qrContent, {
      width: 220,
      margin: 1,
      color: { dark: "#0f172a", light: "#ffffff" },
    });
  } catch {
    qrDataUrl = "";
  }

  const badgeColor = ticket.category?.color || "#f59e0b";
  const access =
    (ticket.guestCount ?? 1) > 1
      ? `Titulaire + ${(ticket.guestCount ?? 1) - 1} personne(s)`
      : "Titulaire";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="780" viewBox="0 0 512 780">
  <defs>
    <linearGradient id="header" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#134e4a"/>
      <stop offset="100%" stop-color="#065f46"/>
    </linearGradient>
    <clipPath id="roundTop"><rect x="0" y="0" width="512" height="780" rx="24"/></clipPath>
  </defs>
  <g clip-path="url(#roundTop)">
    <!-- Fond -->
    <rect width="512" height="780" fill="#ffffff"/>

    <!-- En-tête gradient -->
    <rect width="512" height="260" fill="url(#header)"/>

    <!-- Logo texte -->
    <text x="24" y="40" font-family="Arial, sans-serif" font-size="10" font-weight="bold" fill="rgba(255,255,255,0.7)" letter-spacing="2">SIGMA EVENTS • BILLET OFFICIEL</text>

    <!-- Nom événement -->
    <text x="24" y="80" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="#ffffff">${escSvg(ticket.event.name)}</text>

    <!-- Lieu -->
    <text x="24" y="115" font-family="Arial, sans-serif" font-size="14" fill="rgba(255,255,255,0.85)">📍 ${escSvg(ticket.event.location)}</text>

    <!-- Organisateur -->
    <text x="24" y="140" font-family="Arial, sans-serif" font-size="11" fill="rgba(167,243,208,0.7)">Organisé par : ${escSvg(ticket.event.organizer?.name || "Organisateur")}</text>

    <!-- Date et heure -->
    <text x="24" y="185" font-family="Arial, sans-serif" font-size="11" fill="rgba(255,255,255,0.6)">📅 ${escSvg(formatDate(ticket.event.date))}  ⏰ ${escSvg(formatTime(ticket.event.date))}</text>

    <!-- Catégorie badge -->
    <rect x="380" y="170" width="110" height="26" rx="13" fill="${escSvg(badgeColor)}"/>
    <text x="435" y="188" font-family="Arial, sans-serif" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle">${escSvg(ticket.category?.name || "Standard")}</text>

    <!-- Zone QR -->
    <rect x="24" y="280" width="464" height="240" rx="16" fill="#ecfdf5" stroke="#6ee7b7" stroke-width="2"/>

    <!-- QR Code -->
    ${qrDataUrl ? `<image x="146" y="290" width="220" height="220" href="${qrDataUrl}"/>` : `<text x="256" y="410" font-family="Arial" font-size="14" fill="#6b7280" text-anchor="middle">QR Code</text>`}

    <!-- Référence -->
    <text x="256" y="550" font-family="monospace" font-size="14" font-weight="bold" fill="#334155" text-anchor="middle">#${escSvg(ticket.code)}</text>

    <!-- Ligne pointillée -->
    <line x1="40" y1="575" x2="472" y2="575" stroke="#cbd5e1" stroke-width="1.5" stroke-dasharray="8,6"/>
    <circle cx="16" cy="575" r="12" fill="#f1f5f9"/>
    <circle cx="496" cy="575" r="12" fill="#f1f5f9"/>

    <!-- Titulaire -->
    <text x="24" y="610" font-family="Arial, sans-serif" font-size="9" font-weight="bold" fill="#94a3b8" letter-spacing="2">TITULAIRE DU BILLET</text>
    <text x="24" y="638" font-family="Arial, sans-serif" font-size="20" font-weight="bold" fill="#0f172a">${escSvg(ticket.guestName)}</text>

    <!-- Info grille -->
    <rect x="24" y="660" width="464" height="60" rx="12" fill="#f8fafc"/>
    <text x="40" y="685" font-family="Arial" font-size="10" fill="#94a3b8">Accès</text>
    <text x="40" y="702" font-family="Arial" font-size="12" font-weight="bold" fill="#1e293b">${escSvg(access)}</text>
    <text x="270" y="685" font-family="Arial" font-size="10" fill="#94a3b8">Téléphone</text>
    <text x="270" y="702" font-family="Arial" font-size="12" font-weight="bold" fill="#1e293b">${escSvg(ticket.guestPhone || "Non renseigné")}</text>

    <!-- Bandeau authenticité -->
    <rect x="24" y="730" width="464" height="30" rx="8" fill="#ecfdf5"/>
    <text x="256" y="750" font-family="Arial" font-size="9" font-weight="bold" fill="#065f46" text-anchor="middle">PASS D'ACCÈS AUTHENTIFIÉ ET SÉCURISÉ PAR SIGMA EVENTS</text>

    <!-- Mentions -->
    <text x="256" y="775" font-family="Arial" font-size="8" fill="#94a3b8" text-anchor="middle">Présentez ce QR code à l'entrée. Un seul scan autorisé. Tous droits réservés SIGMA 2026</text>
  </g>
</svg>`;

  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "private, max-age=300",
    },
  });
}
