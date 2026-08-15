import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Route de DIAGNOSTIC TEMPORAIRE — à supprimer après l'audit du déploiement.
// Teste lecture / écriture / transaction sur la base, avec détail complet des erreurs.
export const dynamic = "force-dynamic";

function errDetail(e: unknown): Record<string, unknown> {
  const obj = e as Record<string, unknown>;
  return {
    message: obj?.message ?? String(e),
    code: obj?.code ?? undefined,
    kind: (obj as { kind?: unknown })?.kind ?? undefined,
    cause: obj?.cause ? String(obj.cause) : undefined,
    meta: obj?.meta ? JSON.stringify(obj.meta).slice(0, 300) : undefined,
  };
}

export async function GET() {
  const out: Record<string, unknown> = {};

  // 1. Lecture simple
  try {
    const cnt = await prisma.rateLimitHit.count();
    out.read_count = cnt;
  } catch (e) {
    out.read_count = { error: true, ...errDetail(e) };
  }

  // 2. Écriture simple (create + delete immédiat)
  try {
    const row = await prisma.rateLimitHit.create({ data: { key: `diag-${Date.now()}` } });
    await prisma.rateLimitHit.delete({ where: { id: row.id } });
    out.write_plain = "ok";
  } catch (e) {
    out.write_plain = { error: true, ...errDetail(e) };
  }

  // 3. Transaction avec rollback
  try {
    await prisma.$transaction(async (tx) => {
      await tx.rateLimitHit.create({ data: { key: `diag-tx-${Date.now()}` } });
      throw new Error("ROLLBACK_MARKER");
    });
    out.write_tx = "committed (inattendu)";
  } catch (e) {
    const msg = String(e);
    out.write_tx = msg.includes("ROLLBACK_MARKER") ? "ok (rollback)" : { error: true, ...errDetail(e) };
  }

  // 4. updateMany (le write de createOrder)
  try {
    const res = await prisma.rateLimitHit.updateMany({
      where: { key: "diag-inexistante" },
      data: { key: "diag-modifiee" },
    });
    out.write_updateMany = `ok (${res.count})`;
  } catch (e) {
    out.write_updateMany = { error: true, ...errDetail(e) };
  }

  return NextResponse.json(out);
}
