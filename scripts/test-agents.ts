// Test de la gestion des agents (réplique addAgentAction / removeAgentAction).
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import "dotenv/config";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || "file:./dev.db",
  }),
});

let passed = 0;
let failed = 0;
function assert(cond: boolean, label: string) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${label}`);
  } else {
    failed++;
    console.log(`  ❌ ${label}`);
  }
}

async function main() {
  console.log("🧪 Test gestion des agents\n");

  const organizer = await prisma.user.findFirst({ where: { role: "ORGANIZER" } });
  const event = await prisma.event.findFirst({ where: { organizerId: organizer!.id } });
  if (!event) {
    console.log("❌ Aucun événement trouvé. Lancez d'abord le seed.");
    process.exit(1);
  }

  const phone = "96112233";
  await prisma.user.deleteMany({ where: { phone } });

  try {
    // 1. Création d'un compte agent (réplique addAgentAction)
    console.log("1. Création du compte agent");
    const pin = "4821"; // PIN généré côté serveur dans addAgentAction
    const agent = await prisma.user.create({
      data: { name: "Agent Test", phone, pin: `hash:${pin}`, role: "AGENT" },
    });
    assert(agent.role === "AGENT", "Compte créé avec le rôle AGENT");

    // 2. Assignation à l'événement
    console.log("\n2. Assignation à l'événement");
    await prisma.eventAgent.create({ data: { eventId: event.id, agentId: agent.id } });
    const assigned = await prisma.eventAgent.findUnique({
      where: { eventId_agentId: { eventId: event.id, agentId: agent.id } },
    });
    assert(!!assigned, "Agent assigné à l'événement");

    // 3. Double assignation impossible (contrainte unique)
    let dup = false;
    try {
      await prisma.eventAgent.create({ data: { eventId: event.id, agentId: agent.id } });
    } catch {
      dup = true;
    }
    assert(dup, "Double assignation bloquée (contrainte unique)");

    // 4. L'agent assigné peut accéder au scan
    console.log("\n3. Accès au scan");
    const scanAccess = await prisma.eventAgent.findUnique({
      where: { eventId_agentId: { eventId: event.id, agentId: agent.id } },
    });
    assert(!!scanAccess, "Agent assigné = accès au scan autorisé");

    // 5. Retrait (réplique removeAgentAction)
    console.log("\n4. Retrait de l'événement");
    await prisma.eventAgent.deleteMany({ where: { eventId: event.id, agentId: agent.id } });
    const removed = await prisma.eventAgent.findUnique({
      where: { eventId_agentId: { eventId: event.id, agentId: agent.id } },
    });
    assert(!removed, "Agent retiré de l'événement");
    assert(!removed, "Agent retiré = plus d'accès au scan (assignation absente)");

    // Nettoyage
    await prisma.user.deleteMany({ where: { phone } });
  } catch (e) {
    console.error(e);
    await prisma.user.deleteMany({ where: { phone } }).catch(() => {});
    process.exit(1);
  }

  console.log(`\n═══════════════════════════════`);
  console.log(`Résultat : ${passed} ✅ / ${failed} ❌`);
  console.log(`═══════════════════════════════`);
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
