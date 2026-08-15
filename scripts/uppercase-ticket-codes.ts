// Migration de données : les codes de billets sont désormais générés en MAJUSCULES.
//
// Contexte : les codes étaient créés en minuscules (UUID) alors que toutes les
// recherches (page /t/[code], /i/[code], scanner, sync hors-ligne) normalisent
// l'entrée en MAJUSCULES → les vrais billets aboutissaient à une 404 / INVALID.
// Cette migration passe les codes existants en majuscules pour rétablir la
// correspondance (les liens et QR déjà imprimés restent valides : la recherche
// normalise l'entrée).
//
// Usage : npx tsx scripts/uppercase-ticket-codes.ts
// (fonctionne sur SQLite dev et PostgreSQL prod — le moteur est choisi via DATABASE_URL)
import { prisma } from "../lib/prisma";

async function main() {
  const tickets = await prisma.ticket.findMany({ select: { id: true, code: true } });
  let updated = 0;
  let skipped = 0;

  for (const t of tickets) {
    const upper = t.code.toUpperCase();
    if (upper === t.code) {
      skipped++;
      continue;
    }
    await prisma.ticket.update({ where: { id: t.id }, data: { code: upper } });
    updated++;
  }

  console.log(`✓ ${updated}/${tickets.length} codes de billet passés en majuscules (${skipped} déjà conformes).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
