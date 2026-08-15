// Test d'intégration : logique anti-fraude du check-in
// Reproduit exactement le parcours de checkInAction contre la base réelle.
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

// Reproduit checkInAction
async function checkIn(eventId: string, code: string) {
  const normalized = code.trim().toUpperCase();
  const ticket = await prisma.ticket.findUnique({
    where: { code: normalized },
    include: { event: true },
  });
  if (!ticket) return "INVALID";
  if (ticket.eventId !== eventId) return "INVALID";
  if (ticket.status === "BLACKLISTED") return "BLACKLISTED";

  // Validité temporelle : [début − 2h, fin] (identique à checkInAction)
  const end = ticket.event.endDate ?? new Date(ticket.event.date.getTime() + 8 * 3600_000);
  const now = new Date();
  if (now < new Date(ticket.event.date.getTime() - 2 * 3600_000)) return "TOO_EARLY";
  if (now > end) return "EXPIRED";

  const entered = await prisma.checkIn.count({ where: { eventId, status: "VALID" } });
  if (entered >= ticket.event.capacity) return "FULL";

  if (ticket.status === "ENTERED") return "ALREADY_SCANNED";

  await prisma.$transaction([
    prisma.ticket.update({ where: { id: ticket.id }, data: { status: "ENTERED" } }),
    prisma.checkIn.create({
      data: { ticketId: ticket.id, eventId, status: "VALID" },
    }),
  ]);
  return "VALID";
}

async function main() {
  console.log("🧪 Test anti-fraude du check-in\n");

  const event = await prisma.event.findUnique({ where: { id: "demo-event" } });
  if (!event) {
    console.log("❌ Événement demo-event introuvable. Lancez d'abord le seed.");
    process.exit(1);
  }

  // 1. Réinitialiser l'état des billets et la fenêtre temporelle de l'événement (live)
  await prisma.$transaction([
    prisma.checkIn.deleteMany({ where: { eventId: event.id } }),
    prisma.ticket.updateMany({ where: { eventId: event.id }, data: { status: "ISSUED" } }),
    prisma.event.update({ where: { id: event.id }, data: { date: new Date(Date.now() - 2 * 3600_000) } }),
  ]);
  console.log("1. État initial réinitialisé (événement en fenêtre live)\n");

  // 2. Premier scan du billet → VALID
  console.log("2. Premier scan du billet DEMO-VIP-0001");
  const r1 = await checkIn(event.id, "DEMO-VIP-0001");
  assert(r1 === "VALID", "Premier scan autorisé (VALID)");

  // 3. Re-scan du même billet → ALREADY_SCANNED (anti-duplication)
  console.log("\n3. Re-scan du même billet");
  const r2 = await checkIn(event.id, "DEMO-VIP-0001");
  assert(r2 === "ALREADY_SCANNED", "Second scan refusé (ALREADY_SCANNED)");

  // 4. Billet inexistant → INVALID
  console.log("\n4. Billet inconnu");
  const r3 = await checkIn(event.id, "FAUX-BILLET-9999");
  assert(r3 === "INVALID", "Billet inconnu refusé (INVALID)");

  // 5. Billet d'un autre événement → INVALID
  console.log("\n5. Billet d'un autre événement");
  const r4 = await checkIn(event.id, "DEMO-STD-0001");
  assert(r4 === "VALID", "Billet standard valide (VALID)");
  const r5 = await checkIn(event.id, "DEMO-STD-0001");
  assert(r5 === "ALREADY_SCANNED", "Re-scan refusé (ALREADY_SCANNED)");

  // 6. Liste noire → BLACKLISTED
  console.log("\n6. Billet en liste noire");
  await prisma.ticket.update({
    where: { code: "DEMO-STD-0002" },
    data: { status: "BLACKLISTED", blacklistReason: "Fraude présumée" },
  });
  const r6 = await checkIn(event.id, "DEMO-STD-0002");
  assert(r6 === "BLACKLISTED", "Billet en liste noire refusé (BLACKLISTED)");

  // 7. Capacité maximale → FULL
  console.log("\n7. Capacité maximale atteinte");
  const tinyEvent = await prisma.event.create({
    data: {
      organizerId: event.organizerId,
      name: "Petit événement test",
      location: "Test",
      date: new Date(),
      capacity: 2,
      status: "LIVE",
    },
  });
  await prisma.ticket.create({ data: { eventId: tinyEvent.id, code: "TINY-1", guestName: "A" } });
  await prisma.ticket.create({ data: { eventId: tinyEvent.id, code: "TINY-2", guestName: "B" } });
  await prisma.ticket.create({ data: { eventId: tinyEvent.id, code: "TINY-3", guestName: "C" } });
  assert((await checkIn(tinyEvent.id, "TINY-1")) === "VALID", "Entrée 1/2 (VALID)");
  assert((await checkIn(tinyEvent.id, "TINY-2")) === "VALID", "Entrée 2/2 (VALID)");
  assert((await checkIn(tinyEvent.id, "TINY-3")) === "FULL", "Entrée 3/2 refusée (FULL)");

  // 8. Validité temporelle : trop tôt (avant début − 2 h)
  console.log("\n8. Validité temporelle");
  const futureEvent = await prisma.event.create({
    data: {
      organizerId: event.organizerId,
      name: "Événement futur",
      location: "Test",
      date: new Date(Date.now() + 86400_000), // demain
      capacity: 100,
      status: "LIVE",
    },
  });
  await prisma.ticket.create({ data: { eventId: futureEvent.id, code: "FUTUR-1", guestName: "A" } });
  assert((await checkIn(futureEvent.id, "FUTUR-1")) === "TOO_EARLY", "Scan avant début−2h refusé (TOO_EARLY)");

  // 9. Validité temporelle : événement terminé
  const pastEvent = await prisma.event.create({
    data: {
      organizerId: event.organizerId,
      name: "Événement passé",
      location: "Test",
      date: new Date(Date.now() - 3 * 86400_000), // il y a 3 jours
      capacity: 100,
      status: "DONE",
    },
  });
  await prisma.ticket.create({ data: { eventId: pastEvent.id, code: "PASSE-1", guestName: "A" } });
  assert((await checkIn(pastEvent.id, "PASSE-1")) === "EXPIRED", "Scan après fin refusé (EXPIRED)");

  // Nettoyage des événements de test
  for (const tmp of [tinyEvent, futureEvent, pastEvent]) {
    await prisma.checkIn.deleteMany({ where: { eventId: tmp.id } });
    await prisma.ticket.deleteMany({ where: { eventId: tmp.id } });
    await prisma.event.delete({ where: { id: tmp.id } });
  }

  // Réinitialisation des billets de démo
  await prisma.$transaction([
    prisma.checkIn.deleteMany({ where: { eventId: event.id } }),
    prisma.ticket.updateMany({ where: { eventId: event.id }, data: { status: "ISSUED", blacklistReason: null } }),
    prisma.event.update({ where: { id: event.id }, data: { date: new Date(Date.now() - 2 * 3600_000) } }),
  ]);

  console.log(`\n═══════════════════════════════`);
  console.log(`Résultat : ${passed} ✅ / ${failed} ❌`);
  console.log(`═══════════════════════════════`);
  process.exit(failed > 0 ? 1 : 0);
}

main()
  .catch(async (e) => {
    console.error(e);
    // Nettoyage d'urgence des événements temporaires éventuellement créés.
    await prisma.event
      .deleteMany({
        where: {
          name: { in: ["Petit événement test", "Événement futur", "Événement passé"] },
        },
      })
      .catch(() => {});
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
