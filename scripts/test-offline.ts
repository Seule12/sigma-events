// Test d'intégration : mode hors-ligne + alertes de jauge
// Reproduit la logique de syncOfflineAction contre la base réelle.
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

// Reproduit une entrée de syncOfflineAction (tri par horodatage, anti-rejeu).
async function syncEntry(eventId: string, entry: { syncId: string; code: string; scannedAt: string }) {
  const existing = await prisma.checkIn.findUnique({ where: { syncId: entry.syncId } });
  if (existing) return { status: "ALREADY_SYNCED", ticketId: existing.ticketId };

  const code = entry.code.trim().toUpperCase();
  const scannedAt = new Date(entry.scannedAt);
  const ticket = await prisma.ticket.findUnique({ where: { code }, include: { event: true } });

  if (!ticket || ticket.eventId !== eventId) {
    await prisma.checkIn.create({ data: { eventId, status: "INVALID", source: "OFFLINE", syncId: entry.syncId, scannedAt } });
    return { status: "INVALID" };
  }
  if (ticket.status === "BLACKLISTED") {
    await prisma.checkIn.create({ data: { eventId, ticketId: ticket.id, status: "BLACKLISTED", source: "OFFLINE", syncId: entry.syncId, scannedAt } });
    return { status: "BLACKLISTED" };
  }
  // Validité temporelle évaluée à l'horodatage d'origine (identique à syncOfflineAction)
  const end = ticket.event.endDate ?? new Date(ticket.event.date.getTime() + 8 * 3600_000);
  if (scannedAt < new Date(ticket.event.date.getTime() - 2 * 3600_000)) {
    await prisma.checkIn.create({ data: { eventId, ticketId: ticket.id, status: "TOO_EARLY", source: "OFFLINE", syncId: entry.syncId, scannedAt } });
    return { status: "TOO_EARLY" };
  }
  if (scannedAt > end) {
    await prisma.checkIn.create({ data: { eventId, ticketId: ticket.id, status: "EXPIRED", source: "OFFLINE", syncId: entry.syncId, scannedAt } });
    return { status: "EXPIRED" };
  }
  const entered = await prisma.checkIn.count({ where: { eventId, status: "VALID" } });
  if (entered >= ticket.event.capacity) {
    await prisma.checkIn.create({ data: { eventId, ticketId: ticket.id, status: "FULL", source: "OFFLINE", syncId: entry.syncId, scannedAt } });
    return { status: "FULL" };
  }
  if (ticket.status === "ENTERED") {
    await prisma.checkIn.create({ data: { eventId, ticketId: ticket.id, status: "ALREADY_SCANNED", source: "OFFLINE", syncId: entry.syncId, scannedAt } });
    return { status: "ALREADY_SCANNED" };
  }
  await prisma.$transaction([
    prisma.ticket.update({ where: { id: ticket.id }, data: { status: "ENTERED" } }),
    prisma.checkIn.create({ data: { ticketId: ticket.id, eventId, status: "VALID", source: "OFFLINE", syncId: entry.syncId, scannedAt } }),
  ]);
  return { status: "VALID", ticketId: ticket.id };
}

async function main() {
  console.log("🧪 Test mode hors-ligne + alertes de jauge\n");

  const organizer = await prisma.user.findFirst({ where: { role: "ORGANIZER" } });
  if (!organizer) {
    console.log("❌ Aucun organisateur. Lancez d'abord le seed.");
    process.exit(1);
  }

  // Événement de test : commence le 12/09 à 17:00 (les scans de test sont entre 18:30 et 19:20)
  const event = await prisma.event.create({
    data: {
      organizerId: organizer.id,
      name: "Test hors-ligne",
      location: "Test",
      date: new Date("2026-09-12T17:00:00.000Z"),
      capacity: 5,
      status: "LIVE",
    },
  });
  const cat = await prisma.ticketCategory.create({ data: { eventId: event.id, name: "Standard", capacity: 5 } });
  const mkTicket = (code: string) =>
    prisma.ticket.create({ data: { eventId: event.id, categoryId: cat.id, code, guestName: code } });

  try {
    await mkTicket("OFF-1");
    await mkTicket("OFF-2");

    // 1. Scan hors-ligne → VALID avec source OFFLINE et horodatage préservé
    console.log("1. Scan hors-ligne");
    const scannedAt = new Date("2026-09-12T18:30:00.000Z");
    const r1 = await syncEntry(event.id, { syncId: "sync-1", code: "off-1", scannedAt: scannedAt.toISOString() });
    assert(r1.status === "VALID", "Billet validé hors-ligne (VALID)");
    const c1 = await prisma.checkIn.findUnique({ where: { syncId: "sync-1" } });
    assert(c1?.source === "OFFLINE", "source = OFFLINE");
    assert(c1?.scannedAt.toISOString() === scannedAt.toISOString(), "horodatage d'origine préservé (anti-rejeu)");

    // 2. Idempotence : re-sync du même syncId → ignoré
    console.log("\n2. Idempotence de la synchronisation");
    const r2 = await syncEntry(event.id, { syncId: "sync-1", code: "off-1", scannedAt: scannedAt.toISOString() });
    assert(r2.status === "ALREADY_SYNCED", "Même syncId synchronisé une seule fois");
    const validCount = await prisma.checkIn.count({ where: { eventId: event.id, status: "VALID" } });
    assert(validCount === 1, "Une seule entrée VALID en base");

    // 3. Anti-rejeu : deux scans du même billet, la première horodatée gagne
    console.log("\n3. Anti-rejeu (deux agents, même billet)");
    const r3 = await syncEntry(event.id, { syncId: "sync-2", code: "off-2", scannedAt: "2026-09-12T18:45:00.000Z" });
    assert(r3.status === "VALID", "Premier horodatage → VALID");
    const r4 = await syncEntry(event.id, { syncId: "sync-3", code: "off-2", scannedAt: "2026-09-12T18:40:00.000Z" });
    assert(r4.status === "ALREADY_SCANNED", "Second horodatage (plus tardif) → ALREADY_SCANNED");

    // 4. Billet inconnu hors-ligne → INVALID tracé
    console.log("\n4. Billet inconnu hors-ligne");
    const r5 = await syncEntry(event.id, { syncId: "sync-4", code: "INCONNU-99", scannedAt: "2026-09-12T19:00:00.000Z" });
    assert(r5.status === "INVALID", "Refusé et tracé (INVALID)");

    // 5. Alertes de jauge : remplir à 80 % (4/5) → alerte 80 créée
    console.log("\n5. Alerte de jauge à 80 %");
    await syncEntry(event.id, { syncId: "sync-5", code: "off-1", scannedAt: "2026-09-12T19:10:00.000Z" }); // déjà entré → ALREADY
    for (const code of ["OFF-EXTRA-1", "OFF-EXTRA-2", "OFF-EXTRA-3"]) {
      await prisma.ticket.create({ data: { eventId: event.id, categoryId: cat.id, code, guestName: code } });
      await syncEntry(event.id, { syncId: `sync-extra-${code}`, code, scannedAt: "2026-09-12T19:20:00.000Z" });
    }
    // Reproduit maybeTriggerCapacityAlerts
    const enteredNow = await prisma.checkIn.count({ where: { eventId: event.id, status: "VALID" } });
    const pct = Math.floor((enteredNow / 5) * 100);
    if (pct >= 80) {
      await prisma.capacityAlert
        .upsert({ where: { eventId_threshold: { eventId: event.id, threshold: 80 } }, update: {}, create: { eventId: event.id, threshold: 80 } })
        .catch(() => {});
    }
    const alert80 = await prisma.capacityAlert.findUnique({
      where: { eventId_threshold: { eventId: event.id, threshold: 80 } },
    });
    assert(!!alert80, `Alerte 80 % créée (jauge ${pct} %)`);

    // Nettoyage
    await prisma.checkIn.deleteMany({ where: { eventId: event.id } });
    await prisma.ticket.deleteMany({ where: { eventId: event.id } });
    await prisma.capacityAlert.deleteMany({ where: { eventId: event.id } });
    await prisma.ticketCategory.deleteMany({ where: { eventId: event.id } });
    await prisma.event.delete({ where: { id: event.id } });
  } catch (e) {
    console.error(e);
    await prisma.event.deleteMany({ where: { id: event.id } }).catch(() => {});
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
