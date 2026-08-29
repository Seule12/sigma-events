import { NextResponse } from "next/server";
import { findTerminalByToken } from "@/lib/terminal";
import { terminalCheckInAction } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { withErrorCapture } from "@/lib/sentry";

// Validation temps réel depuis un terminal : le serveur est la source de vérité.
// POST /api/scanner/check   Authorization: Bearer <token>   { code: "SIG-839281" }
export const POST = withErrorCapture(async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const terminal = await findTerminalByToken(token);
  if (!terminal) return NextResponse.json({ error: "Terminal non autorisé." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").trim();
  if (!code) return NextResponse.json({ error: "Code manquant." }, { status: 400 });

  const result = await terminalCheckInAction(terminal.id, code);

  // Tient le journal d'activité du terminal à jour.
  await prisma.terminal
    .update({ where: { id: terminal.id }, data: { lastSeenAt: new Date(), lastScanAt: new Date() } })
    .catch(() => {});

  return NextResponse.json(result);
});
