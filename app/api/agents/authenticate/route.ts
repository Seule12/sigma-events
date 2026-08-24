import { NextResponse } from "next/server";
import { Role } from "@/app/generated/prisma/enums";
import { activateTerminalWithCode } from "@/lib/terminal";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/csv";
import { getCurrentUser } from "@/lib/auth";
import bcrypt from "bcryptjs";

// Authentification d'un agent pour l'app SIGMA Scanner (projet de référence) :
// l'agent fournit téléphone + PIN + identifiant du terminal (ex : T-9281, fourni
// par l'organisateur, affiché en permanence sur le dashboard). Retourne une
// session au format AgentSession : identité de l'agent, événement assigné et
// token API du terminal.
// POST /api/agents/authenticate  { code: "T-9281", phone: "97000000", pin: "1234" }

const WINDOW_MS = 10 * 60_000;
const MAX_FAILURES = 5;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").trim();
  const phone = normalizePhone(String(body?.phone ?? ""));
  const pin = String(body?.pin ?? "");

  if (!code || phone.length < 8 || !pin) {
    return NextResponse.json({ error: "Identifiant du terminal, téléphone et PIN requis." }, { status: 400 });
  }

  // Anti-bruteforce : 5 échecs max par numéro + IP sur 10 min (ne compte que les échecs).
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "0";
  const rateKey = `agent-auth:${phone}:${ip}`;
  const failures = await prisma.rateLimitHit.count({
    where: { key: rateKey, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
  });
  if (failures >= MAX_FAILURES) {
    return NextResponse.json({ error: "Trop de tentatives. Réessayez dans quelques minutes." }, { status: 429 });
  }
  const recordFailure = () => prisma.rateLimitHit.create({ data: { key: rateKey } }).catch(() => {});

  // Agent déjà connecté dans l'app web ? Sinon téléphone + PIN (agent uniquement).
  const sessionUser = await getCurrentUser();
  let agent = sessionUser?.role === Role.AGENT ? sessionUser : null;
  if (!agent) {
    const byPhone = await prisma.user.findUnique({ where: { phone } });
    if (!byPhone || byPhone.role !== Role.AGENT || byPhone.active === false || !byPhone.pin) {
      await recordFailure();
      return NextResponse.json({ error: "Identifiants agent invalides." }, { status: 401 });
    }
    if (!(await bcrypt.compare(pin, byPhone.pin))) {
      await recordFailure();
      return NextResponse.json({ error: "Identifiants agent invalides." }, { status: 401 });
    }
    agent = byPhone;
  }

  const terminal = await activateTerminalWithCode(code, agent.id);
  if (!terminal) {
    return NextResponse.json(
      { error: "Identifiant du terminal invalide ou déjà activé." },
      { status: 401 }
    );
  }

  const event = await prisma.event.findUnique({ where: { id: terminal.eventId } });
  if (!event) {
    return NextResponse.json({ error: "Événement introuvable." }, { status: 404 });
  }

  // Format AgentSession du projet de référence sigma-scanner-project-1.
  return NextResponse.json({
    agentId: agent.id,
    agentName: agent.name,
    eventId: event.id,
    eventName: event.name,
    apiToken: terminal.token,
    expiresAt: Math.floor((terminal.tokenExpiresAt ?? new Date()).getTime() / 1000),
  });
}
