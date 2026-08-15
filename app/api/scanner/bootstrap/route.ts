import { NextResponse } from "next/server";
import { findTerminalByToken, TERMINAL_TOKEN_TTL_MS, generateTerminalToken } from "@/lib/terminal";
import { prisma } from "@/lib/prisma";

// Le terminal télécharge les données nécessaires avant l'événement (offline-first) :
// GET /api/scanner/bootstrap   Authorization: Bearer <token>
// Réponse : événement, catégories (zones), billets/invitations, règles d'accès.
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const terminal = await findTerminalByToken(token);
  if (!terminal) return NextResponse.json({ error: "Terminal non autorisé." }, { status: 401 });

  // Renouvelle le token (tokens courts et renouvelables) : le terminal l'écrase en local.
  const freshToken = generateTerminalToken();
  await prisma.terminal.update({
    where: { id: terminal.id },
    data: {
      token: freshToken,
      tokenExpiresAt: new Date(Date.now() + TERMINAL_TOKEN_TTL_MS),
      lastSeenAt: new Date(),
    },
  });

  const categories = await prisma.ticketCategory.findMany({
    where: { eventId: terminal.eventId },
    select: { id: true, name: true, zones: true },
  });

  const tickets = await prisma.ticket.findMany({
    where: { eventId: terminal.eventId },
    select: {
      id: true, // nécessaire au déchiffrement hors-ligne (le QR chiffré encode l'id)
      code: true,
      guestName: true,
      guestCount: true,
      entriesCount: true,
      status: true,
      blacklistReason: true,
      inviteStatus: true,
      category: { select: { id: true, name: true, zones: true } },
    },
  });

  return NextResponse.json({
    terminal: { id: terminal.id, code: terminal.code, name: terminal.name, zone: terminal.zone },
    event: {
      id: terminal.event.id,
      name: terminal.event.name,
      location: terminal.event.location,
      date: terminal.event.date.toISOString(),
      endDate: terminal.event.endDate?.toISOString() ?? null,
      capacity: terminal.event.capacity,
      // Fonction urgence : le terminal affiche ENTRÉES SUSPENDUES si bloqué.
      entranceBlocked: terminal.event.entranceBlocked,
    },
    agent: terminal.agent ? { id: terminal.agent.id, name: terminal.agent.name } : null,
    categories,
    tickets,
    token: freshToken,
    syncedAt: new Date().toISOString(),
  });
}
