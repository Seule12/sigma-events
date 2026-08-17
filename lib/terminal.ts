import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { TerminalStatus } from "@/app/generated/prisma/enums";

// Durée de validité du token d'authentification du terminal (renouvelé à chaque bootstrap).
export const TERMINAL_TOKEN_TTL_MS = 12 * 3600_000;

export function generateTerminalToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export function generateTerminalCode(): string {
  // Identifiant alphanumérique du terminal, ex : T-9281.
  // C'est CET identifiant que l'agent saisit dans SIGMA Scanner pour activer le
  // terminal (affiché en permanence sur le dashboard — pas de code temporaire).
  return `T-${randomInt(1000, 10000)}`;
}

type TerminalCreateInput = {
  eventId: string;
  name: string; // ex : "Porte A — Entrée principale"
  zone?: string | null; // ex : "main" | "vip" | "backstage"
};

// Crée un terminal INACTIVE. L'agent l'active dans SIGMA Scanner en saisissant
// l'identifiant du terminal (code T-XXXX) que l'organisateur voit sur le dashboard.
export async function createTerminal({ eventId, name, zone }: TerminalCreateInput) {
  return prisma.terminal.create({
    data: {
      eventId,
      name,
      zone: zone || null,
      code: generateTerminalCode(),
      status: TerminalStatus.INACTIVE,
    },
  });
}

// Active un terminal par son identifiant (code T-XXXX) saisi par l'agent :
// associe terminal + événement + porte + agent, et émet un token court.
// L'identifiant est permanent (pas d'expiration) — seul un terminal INACTIVE
// peut être activé (une fois ACTIVE, il faut passer par DISABLED puis réactiver).
export async function activateTerminalWithCode(code: string, agentId: string) {
  const terminal = await prisma.terminal.findFirst({
    where: {
      status: TerminalStatus.INACTIVE,
      // Normalisation de casse : l'agent peut saisir l'identifiant en minuscules.
      code: code.trim().toUpperCase(),
    },
  });
  if (!terminal) return null;

  const token = generateTerminalToken();
  return prisma.terminal.update({
    where: { id: terminal.id },
    data: {
      status: TerminalStatus.ACTIVE,
      agentId,
      token,
      tokenExpiresAt: new Date(Date.now() + TERMINAL_TOKEN_TTL_MS),
      lastSeenAt: new Date(),
    },
  });
}

// Authentifie un terminal par son token (Authorization: Bearer).
export async function findTerminalByToken(token?: string | null) {
  if (!token) return null;
  const terminal = await prisma.terminal.findFirst({
    where: { token, tokenExpiresAt: { gt: new Date() } },
    include: { event: true, agent: true },
  });
  if (!terminal || terminal.status !== TerminalStatus.ACTIVE) return null;
  return terminal;
}
