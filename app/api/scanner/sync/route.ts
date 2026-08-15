import { NextResponse } from "next/server";
import { findTerminalByToken } from "@/lib/terminal";
import { syncTerminalAction, type OfflineEntry } from "@/app/actions";

// Synchronisation des scans hors-ligne d'un terminal. Le serveur est la source
// de vérité : il résout les conflits (premier horodaté gagne) et confirme.
// POST /api/scanner/sync   Authorization: Bearer <token>   { entries: OfflineEntry[] }
export async function POST(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const terminal = await findTerminalByToken(token);
  if (!terminal) return NextResponse.json({ error: "Terminal non autorisé." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const entries: OfflineEntry[] = Array.isArray(body?.entries) ? body.entries : [];
  if (entries.length === 0) {
    return NextResponse.json({ synced: 0, alreadySynced: 0, failed: 0, processedIds: [] });
  }

  const result = await syncTerminalAction(terminal.id, entries);
  return NextResponse.json(result);
}
