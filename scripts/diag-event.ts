import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import "dotenv/config";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./dev.db" }),
});

async function main() {
  const cols = (await prisma.$queryRawUnsafe("PRAGMA table_info(Event)")) as Array<{ name: string }>;
  console.log("colonnes Event :", cols.map((c) => c.name).join(", "));
  const evs = (await prisma.$queryRawUnsafe("SELECT id, name, capacity FROM Event")) as Array<{
    id: string;
    name: string;
    capacity: number;
  }>;
  console.log("événements :", JSON.stringify(evs));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
