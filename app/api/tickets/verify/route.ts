import { NextResponse } from "next/server";
import { findTerminalByToken } from "@/lib/terminal";
import { terminalCheckInAction } from "@/app/actions";
import { prisma } from "@/lib/prisma";

// Vérification EN LIGNE d'un billet scanné (projet de référence) : l'app envoie
// le contenu BRUT du QR (blob chiffré AES-256-GCM) — le serveur le déchiffre
// avec la clé de session de l'événement, retrouve le billet par son id et
// applique toutes les règles métier (zone, liste noire, temporalité, capacité,
// double-scan atomique). Le scanner n'a jamais la clé maîtresse.
// POST /api/tickets/verify  Authorization: Bearer <token>  { qrContent, agentId? }

export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const terminal = await findTerminalByToken(token);
  if (!terminal) {
    return NextResponse.json({ error: "Terminal non autorisé." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const qrContent = String(body?.qrContent ?? "").trim();
  if (!qrContent) {
    return NextResponse.json({ ok: false, reason: "QR_MISSING" }, { status: 400 });
  }

  const result = await terminalCheckInAction(terminal.id, qrContent);

  // Journal d'activité du terminal.
  await prisma.terminal
    .update({
      where: { id: terminal.id },
      data: { lastSeenAt: new Date(), lastScanAt: new Date() },
    })
    .catch(() => {});

  // Réponse au format du projet de référence (status + détail).
  return NextResponse.json({ ok: result.status === "VALID" || result.status === "ENTRY", ...result });
}
