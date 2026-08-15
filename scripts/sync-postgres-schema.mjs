// Resynchronise prisma/schema.postgres.prisma depuis prisma/schema.prisma
// (source de vérité) : applique provider="postgresql" + sortie prisma-pg.
//
// Usage :
//   node scripts/sync-postgres-schema.mjs           → réécrit le schéma Postgres
//   node scripts/sync-postgres-schema.mjs --check   → vérifie sans écrire
//
// Après modification du schéma SQLite, lancer ce script puis régénérer le
// client Postgres :  npm run db:generate:pg
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sqlite = readFileSync(resolve(root, "prisma/schema.prisma"), "utf-8");
const targetPath = resolve(root, "prisma/schema.postgres.prisma");

const header =
  "// ============================================================\n" +
  "// SCHÉMA POSTGRESQL (production — Supabase)\n" +
  "// Généré automatiquement depuis prisma/schema.prisma par\n" +
  "// scripts/sync-postgres-schema.mjs — NE PAS modifier à la main.\n" +
  "// ============================================================\n";

const pg = header + sqlite.replace('provider = "sqlite"', 'provider = "postgresql"').replace(
  'output   = "../app/generated/prisma"',
  'output   = "../app/generated/prisma-pg"'
);

const current = readFileSync(targetPath, "utf-8");
const check = process.argv.includes("--check");
if (current === pg) {
  console.log(check ? "✅ Schéma Postgres à jour." : "Schéma Postgres déjà à jour.");
  process.exit(0);
}
if (check) {
  console.error("❌ Schéma Postgres désynchronisé — lancer : node scripts/sync-postgres-schema.mjs");
  process.exit(1);
}
writeFileSync(targetPath, pg);
console.log("✅ Schéma Postgres resynchronisé (provider postgresql + sortie prisma-pg).");
