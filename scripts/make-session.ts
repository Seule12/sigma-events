// Crée une session de test et imprime le token sur stdout (format TOKEN=...)
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import "dotenv/config";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || "file:./dev.db",
  }),
});

const role = process.env.SESSION_ROLE || "ORGANIZER";

async function main() {
  const user = await prisma.user.findFirst({ where: { role: role as "SUPER_ADMIN" | "ORGANIZER" | "AGENT" } });
  if (!user) {
    console.error(`Aucun utilisateur ${role} trouvé. Lancez d'abord le seed.`);
    process.exit(1);
  }
  const token = crypto.randomUUID().replace(/-/g, "");
  await prisma.session.deleteMany({ where: { userId: user.id } });
  await prisma.session.create({
    data: { token, userId: user.id, expiresAt: new Date(Date.now() + 86400_000) },
  });
  console.log(`TOKEN=${token}`);
  console.log(`NAME=${user.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
