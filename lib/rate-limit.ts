// Rate limiting persistant (anti-bot / anti-bruteforce) — fenêtre glissante en
// **base de données** (table RateLimitHit), partagée entre toutes les instances
// de serveur (production multi-instance). Remplace l'ancien bucket en mémoire.
//
// Signature : isRateLimited(key, limit, windowMs) → Promise<boolean>
// (true = la requête est limitée / refusée).

import { prisma } from "@/lib/prisma";

/** Purge : supprime les hits plus vieux que la fenêtre la plus longue utilisée
 *  (10 min partout aujourd'hui — on garde 30 min de marge). */
const PURGE_OLDER_THAN_MS = 30 * 60_000;

/** Probabilité de purge à chaque appel (≈1 % → ~1 purge / 100 requêtes par
 *  instance) : évite de lancer un DELETE à CHAQUE requête, y compris en
 *  serverless où le module est recréé à chaque invocation. */
const PURGE_PROBABILITY = 0.01;

export async function isRateLimited(key: string, limit: number, windowMs: number): Promise<boolean> {
  const now = Date.now();
  const windowStart = new Date(now - windowMs);

  // Purge occasionnelle (1 % des appels, best-effort) — ne jamais bloquer sur ça.
  if (Math.random() < PURGE_PROBABILITY) {
    await prisma.rateLimitHit
      .deleteMany({ where: { createdAt: { lt: new Date(now - PURGE_OLDER_THAN_MS) } } })
      .catch(() => {});
  }

  // Compter les hits dans la fenêtre glissante.
  const count = await prisma.rateLimitHit.count({
    where: { key, createdAt: { gte: windowStart } },
  });

  // Limite atteinte : on refuse SANS enregistrer ce hit (une requête bloquée ne
  // doit pas resserrer la fenêtre des suivantes — pas de dérive sous attaque).
  if (count >= limit) return true;

  // Requête autorisée : on enregistre le hit (best-effort).
  await prisma.rateLimitHit.create({ data: { key } }).catch(() => {});
  return false;
}
