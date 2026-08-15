import { NextResponse } from "next/server";
import { Role } from "@/app/generated/prisma/enums";
import { activateTerminalWithCode } from "@/lib/terminal";
import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/csv";
import { getCurrentUser } from "@/lib/auth";
import bcrypt from "bcrypt";

// Activation d'un terminal depuis SIGMA Scanner (app mobile, pas de session cookie) :
// l'agent saisit son téléphone + PIN, puis le code d'activation fourni par l'organisateur.
// POST /api/scanner/activate  { code: "847291", phone: "97000000", pin: "1234" }
//
// Anti-bruteforce : le PIN agent (4 chiffres) est vérifié ici par bcrypt — sans
// garde, un attaquant pourrait énumérer les combinaisons. On limite à 5 échecs
// par numéro et par IP sur 10 min, et on ne compte QUE les échecs (une activation
// réussie n'enregistre rien — pas de DoS par verrouillage).
const ACTIVATE_WINDOW_MS = 10 * 60_000;
const ACTIVATE_MAX_FAILURES = 5;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const code = String(body?.code ?? "").trim();
  const phone = normalizePhone(String(body?.phone ?? ""));
  const pin = String(body?.pin ?? "");

  if (!code || phone.length < 8 || !pin) {
    return NextResponse.json({ error: "Code, téléphone et PIN requis." }, { status: 400 });
  }

  // Clé de rate limiting : numéro (échecs de PIN) + IP (défense en profondeur).
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("cf-connecting-ip") || "0";
  const rateKey = `activate:${phone}:${ip}`;
  const failures = await prisma.rateLimitHit.count({
    where: { key: rateKey, createdAt: { gte: new Date(Date.now() - ACTIVATE_WINDOW_MS) } },
  });
  if (failures >= ACTIVATE_MAX_FAILURES) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessayez dans quelques minutes." },
      { status: 429 }
    );
  }
  const recordFailure = () =>
    prisma.rateLimitHit.create({ data: { key: rateKey } }).catch(() => {});

  // Agent connecté dans l'app web ? (si oui, on utilise sa session sans mot de passe)
  // getCurrentUser() ne lève jamais sur absence de session : il renvoie null.
  const sessionUser = await getCurrentUser();
  let agent = sessionUser?.role === Role.AGENT ? sessionUser : null;

  // Sinon : authentification classique téléphone + PIN (agent seulement).
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
      { error: "Code d'activation invalide ou expiré (valable 15 minutes)." },
      { status: 401 }
    );
  }

  const event = await prisma.event.findUnique({ where: { id: terminal.eventId } });
  return NextResponse.json({
    terminal: {
      id: terminal.id,
      code: terminal.code,
      name: terminal.name,
      zone: terminal.zone,
      status: terminal.status,
      token: terminal.token, // stocké localement dans l'app scanner
    },
    event: event
      ? {
          id: event.id,
          name: event.name,
          location: event.location,
          date: event.date.toISOString(),
        }
      : null,
    agent: { id: agent.id, name: agent.name },
  });
}
