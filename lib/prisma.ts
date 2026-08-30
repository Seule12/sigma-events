// Client Prisma partagé — sélection automatique du moteur selon DATABASE_URL.
//
//  - SQLite (développement local + tests) : DATABASE_URL = "file:./dev.db"
//    → adapter better-sqlite3 + client généré app/generated/prisma.
//  - PostgreSQL (production — Supabase) : DATABASE_URL = "postgresql://…"
//    → adapter @prisma/adapter-pg + client généré app/generated/prisma-pg
//  - MySQL (production — LWS cPanel) : DATABASE_URL = "mysql://…"
//    → PrismaClient direct (pas d'adapter) + client généré app/generated/prisma-mysql
//
// Le type exporté est celui du client SQLite, utilisé comme type canonique
// dans tout le code applicatif : les clients générés sont structurellement
// identiques (mêmes modèles). Garder les schémas synchronisés.
//
// NB : le binaire natif better-sqlite3 est externalisé du bundle Next.js via
// `serverExternalPackages` (next.config.ts) pour ne pas casser les builds.
import { PrismaClient as SqlitePrismaClient } from "@/app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient as PgPrismaClient } from "@/app/generated/prisma-pg/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient as MysqlPrismaClient } from "@/app/generated/prisma-mysql/client";

const globalForPrisma = globalThis as unknown as { prisma?: unknown };

function isPostgresUrl(url: string | undefined): boolean {
  return Boolean(url && (url.startsWith("postgresql://") || url.startsWith("postgres://")));
}

function isMysqlUrl(url: string | undefined): boolean {
  return Boolean(url && url.startsWith("mysql://"));
}

function createPrisma() {
  const url = process.env.DATABASE_URL || "file:./dev.db";
  if (isMysqlUrl(url)) {
    // Production MySQL (LWS cPanel) — Prisma client direct, pas d'adapter nécessaire.
    return new MysqlPrismaClient({
      datasources: { db: { url } },
    });
  }
  if (isPostgresUrl(url)) {
    // Production : PostgreSQL (Supabase) — le pooler (DATABASE_URL) en runtime.
    return new PgPrismaClient({
      adapter: new PrismaPg({ connectionString: url }),
    });
  }
  // Développement local + tests : SQLite.
  return new SqlitePrismaClient({
    adapter: new PrismaBetterSqlite3({ url }),
  });
}

export const prisma = (globalForPrisma.prisma ?? createPrisma()) as unknown as SqlitePrismaClient;

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
