// Config Prisma — sélection automatique du schéma selon le type de base.
//
//  - SQLite (dev + tests)   : DATABASE_URL = "file:./dev.db"
//    → prisma/schema.prisma + migrations SQLite (prisma/migrations).
//  - PostgreSQL (production) : DATABASE_URL = "postgresql://…" (Supabase)
//    → prisma/schema.postgres.prisma + migrations Postgres (prisma/migrations-pg).
//
// CLI (migrations) vs runtime :
//  - Le CLI (prisma migrate deploy / dev) doit se connecter en DIRECT (port
//    5432 de Supabase) : renseigner DIRECT_URL si le pooler (6543) est utilisé
//    par DATABASE_URL. Sinon, DATABASE_URL est utilisé tel quel.
import "dotenv/config";
import { defineConfig } from "prisma/config";

const url = process.env["DATABASE_URL"] || "";
const isPostgres = url.startsWith("postgresql://") || url.startsWith("postgres://");

export default defineConfig({
  schema: isPostgres ? "prisma/schema.postgres.prisma" : "prisma/schema.prisma",
  migrations: {
    path: isPostgres ? "prisma/migrations-pg" : "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] || url,
  },
});
