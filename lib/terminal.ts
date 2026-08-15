import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { TerminalStatus } from "@/app/generated/prisma/enums";

// Durée de validité du code d'activation (15 min, cf. cahier des charges SIGMA Scanner).
export const ACTIVATION_CODE_TTL_MS = 15 * 60_000;
// Durée de validité du token d'authentification du terminal (renouvelé à chaque bootstrap).
export const TERMINAL_TOKEN_TTL_MS = 12 * 3600_000;

// Alphabet du code d'activation : 32 caractères SANS ambiguïté (pas de 0/O, 1/I/L)
// pour une saisie fiable sur téléphone. 6 caractères = 32^6 ≈ 1 milliard de
// combinaisons — largement suffisant pour un code éphémère de 15 minutes.
const ACTIVATION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateActivationCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += ACTIVATION_ALPHABET[randomInt(0, ACTIVATION_ALPHABET.length)];
  return out;
}

export function generateTerminalToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

export function generateTerminalCode(): string {
  // Identifiant court du terminal, ex : T-9281 (lisible sur le dashboard).
  return `T-${randomInt(1000, 10000)}`;
}

type TerminalCreateInput = {
  eventId: string;
  name: string; // ex : "Porte A — Entrée principale"
  zone?: string | null; // ex : "main" | "vip" | "backstage"
};

// Crée un terminal INACTIVE avec un code d'activation temporaire.
// L'organisateur le communique à l'agent qui le saisit dans SIGMA Scanner.
export async function createTerminal({ eventId, name, zone }: TerminalCreateInput) {
  return prisma.terminal.create({
    data: {
      eventId,
      name,
      zone: zone || null,
      code: generateTerminalCode(),
      status: TerminalStatus.INACTIVE,
      activationCode: generateActivationCode(),
      activationCodeExpiresAt: new Date(Date.now() + ACTIVATION_CODE_TTL_MS),
    },
  });
}

// Génère un NOUVEAU code d'activation pour un terminal existant (l'ancien expire).
export async function regenerateActivationCode(terminalId: string) {
  return prisma.terminal.update({
    where: { id: terminalId },
    data: {
      activationCode: generateActivationCode(),
      activationCodeExpiresAt: new Date(Date.now() + ACTIVATION_CODE_TTL_MS),
    },
  });
}

// Active un terminal avec le code d'activation saisi par l'agent :
// associe terminal + événement + porte + agent, et émet un token court.
export async function activateTerminalWithCode(code: string, agentId: string) {
  const terminal = await prisma.terminal.findFirst({
    where: {
      status: TerminalStatus.INACTIVE,
      // Normalisation de casse : le code généré est en majuscules, l'agent peut
      // le saisir en minuscules sur le téléphone.
      activationCode: code.trim().toUpperCase(),
      activationCodeExpiresAt: { gt: new Date() },
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
      activationCode: null, // le code ne sert plus qu'une fois
      activationCodeExpiresAt: null,
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
