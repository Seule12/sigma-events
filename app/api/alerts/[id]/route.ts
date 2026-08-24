import { NextResponse } from "next/server";
import { Role } from "@/app/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { acknowledgeAlert, resolveAlert, closeAlert } from "@/lib/alerts";

export const dynamic = "force-dynamic";

// PATCH /api/alerts/[id] — Mettre à jour le statut d'une alerte
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== Role.SUPER_ADMIN && user.role !== Role.ORGANIZER)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Body invalide" }, { status: 400 });
  }

  const { action, note } = body;

  if (action === "acknowledge") {
    const result = await acknowledgeAlert(id, user.id, note ?? "Je m'en occupe");
    if (!result) {
      return NextResponse.json({ error: "Transition invalide" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "resolve") {
    const result = await resolveAlert(id, user.id, note ?? "Résolu");
    if (!result) {
      return NextResponse.json({ error: "Transition invalide" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  }

  if (action === "close") {
    const result = await closeAlert(id);
    if (!result) {
      return NextResponse.json({ error: "Transition invalide" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}
