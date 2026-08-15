import { NextResponse } from "next/server";
import { findTerminalByToken } from "@/lib/terminal";
import { deriveEventSessionKey, hasTicketCryptoSecret } from "@/lib/ticket-crypto";
import { prisma } from "@/lib/prisma";

// Délivre la clé de session d'un événement à un terminal authentifié (Bearer
// token). Cette clé (dérivée de TICKET_QR_SECRET par HMAC, unique par événement)
// permet à l'app scanner de DÉCHIFFRER les QR hors-ligne — jamais la clé
// maîtresse. Politique d'expiration : fin d'événement + 2 h (marge).
// GET /api/events/:id/session-key   Authorization: Bearer <token>

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const terminal = await findTerminalByToken(token);
  if (!terminal) {
    return NextResponse.json({ error: "Terminal non autorisé." }, { status: 401 });
  }
  // Le terminal n'obtient la clé que de SON événement.
  if (terminal.eventId !== id) {
    return NextResponse.json({ error: "Événement non autorisé pour ce terminal." }, { status: 403 });
  }
  if (!hasTicketCryptoSecret()) {
    return NextResponse.json(
      { error: "TICKET_QR_SECRET non configuré — clé de session indisponible." },
      { status: 503 }
    );
  }

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "Événement introuvable." }, { status: 404 });

  // Expiration : fin d'événement + 2 h (défaut : début + 8 h + 2 h).
  const end = event.endDate ?? new Date(event.date.getTime() + 8 * 3600_000);
  const expiresAt = Math.floor((end.getTime() + 2 * 3600_000) / 1000);

  // Format EventSessionKey du projet de référence.
  return NextResponse.json({
    eventId: id,
    keyHex: deriveEventSessionKey(id).toString("hex"),
    expiresAt,
  });
}
