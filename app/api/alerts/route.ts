import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Role } from "@/app/generated/prisma/enums";
import { getCurrentUser } from "@/lib/auth";
import { createAlert, listAlerts, alertStats } from "@/lib/alerts";
import { AlertLevel, AlertSource } from "@/app/generated/prisma/enums";

export const dynamic = "force-dynamic";

// GET /api/alerts — Liste les alertes + stats (admin ou organisateur)
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== Role.SUPER_ADMIN && user.role !== Role.ORGANIZER)) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get("eventId") ?? undefined;
  const level = searchParams.get("level") as AlertLevel | null;
  const status = searchParams.get("status") as import("@/app/generated/prisma/enums").AlertStatus | null;
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);

  const alerts = await listAlerts({
    eventId,
    level: level ?? undefined,
    status: status ?? undefined,
    limit,
  });

  const stats = await alertStats(eventId ?? undefined);

  return NextResponse.json({ alerts, stats });
}

// POST /api/alerts — Créer une alerte
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Body invalide" }, { status: 400 });
  }

  const { categoryId, level, content, location, eventId } = body;
  if (!categoryId || !content) {
    return NextResponse.json({ error: "categoryId et content requis" }, { status: 400 });
  }

  const alert = await createAlert({
    categoryId,
    level: level ?? AlertLevel.WARNING,
    source: user.role === Role.AGENT ? AlertSource.AGENT : AlertSource.USER,
    content,
    location,
    userId: user.id,
    eventId,
  });

  return NextResponse.json(alert, { status: 201 });
}
