// Test du module de parsing CSV partagé (lib/csv.ts) — le vrai code de l'action d'import.
import { parseGuestCsv, normalizePhone } from "../lib/csv";
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
  console.log("🧪 Test import CSV\n");

  // 1. CSV Excel FR (délimiteur ; + en-tête)
  console.log("1. CSV Excel FR (; + en-tête)");
  const fr = "nom;téléphone;catégorie\nAya Hounkpatin;97 12 34 56;VIP\nJunior Agbodjan;+229 66 78 90 12;Standard\nFati Zannou;95401122;vip\n";
  const r1 = parseGuestCsv(fr);
  assert(r1.error === null && r1.rows.length === 3, "3 invités extraits (en-tête ignoré)");
  assert(r1.rows[0].name === "Aya Hounkpatin" && r1.rows[0].phone === "97123456", "Téléphone normalisé (espaces retirés)");
  assert(r1.rows[1].phone === "66789012", "Préfixe +229 retiré");
  assert(r1.rows[2].categoryName.toLowerCase() === "vip", "Catégorie conservée");

  // 2. CSV virgule + guillemets (nom avec ; dedans)
  console.log("\n2. CSV virgule + guillemets");
  const en = 'name,phone,category\n"Doe; Jr",97123456,VIP\n';
  const r2 = parseGuestCsv(en);
  assert(r2.rows.length === 1 && r2.rows[0].name === "Doe; Jr", "Guillemets et ; dans un champ gérés");

  // 3. Normalisation des téléphones
  console.log("\n3. Normalisation téléphone");
  assert(normalizePhone("22997123456") === "97123456", "'229' préfixe retiré");
  assert(normalizePhone("97 12.34-56") === "97123456", "Séparateurs retirés");

  // 4. Fichier vide / trop grand
  console.log("\n4. Cas limites");
  assert(parseGuestCsv("").error === "EMPTY", "Fichier vide → EMPTY");
  assert(parseGuestCsv("nom\n\n\n").rows.length === 0, "Lignes vides ignorées");

  // 5. Import réel contre la base (événement temporaire)
  console.log("\n5. Import réel en base (catégories + doublons)");
  const organizer = await prisma.user.findFirst({ where: { role: "ORGANIZER" } });
  const event = await prisma.event.create({
    data: { organizerId: organizer!.id, name: "Test CSV", location: "Test", date: new Date(), capacity: 50, status: "LIVE" },
  });
  const vip = await prisma.ticketCategory.create({ data: { eventId: event.id, name: "VIP", capacity: 20 } });
  await prisma.ticketCategory.create({ data: { eventId: event.id, name: "Standard", capacity: 30 } });
  await prisma.ticket.create({ data: { eventId: event.id, categoryId: vip.id, code: "EXIST-1", guestName: "Déjà invité", guestPhone: "97990000" } });

  const csv = "nom;téléphone;catégorie\nAya Hounkpatin;97123456;VIP\nJunior Agbodjan;66789012;Standard\nDéjà invité;97990000;VIP\nSans téléphone;;VIP\n";
  const { rows } = parseGuestCsv(csv);
  const categories = await prisma.ticketCategory.findMany({ where: { eventId: event.id } });
  const defaultCategory = categories[0];
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c.id]));
  const existingPhones = new Set(
    (await prisma.ticket.findMany({ where: { eventId: event.id, guestPhone: { not: null } }, select: { guestPhone: true } })).map((t) => t.guestPhone)
  );

  let created = 0;
  const toCreate: Array<{ eventId: string; categoryId?: string; code: string; guestName: string; guestPhone?: string }> = [];
  for (const row of rows) {
    if (row.phone && existingPhones.has(row.phone)) continue;
    if (row.phone) existingPhones.add(row.phone);
    const categoryId = row.categoryName ? categoryByName.get(row.categoryName.toLowerCase()) : undefined;
    toCreate.push({
      eventId: event.id,
      ...(categoryId ? { categoryId } : defaultCategory ? { categoryId: defaultCategory.id } : {}),
      code: crypto.randomUUID().replace(/-/g, ""),
      guestName: row.name,
      ...(row.phone ? { guestPhone: row.phone } : {}),
    });
    created++;
  }
  assert(created === 3, "Doublon téléphone ignoré (3 créés au lieu de 4)");
  await prisma.ticket.createMany({ data: toCreate });

  const inDb = await prisma.ticket.findMany({ where: { eventId: event.id }, include: { category: true } });
  const aya = inDb.find((t) => t.guestName === "Aya Hounkpatin");
  assert(!!aya && aya.category?.name === "VIP", "Catégorie 'VIP' rattachée par nom");
  const noPhone = inDb.find((t) => t.guestName === "Sans téléphone");
  assert(!!noPhone && noPhone.guestPhone === null, "Invité sans téléphone accepté");
  assert(inDb.length === 4, "4 billets au total en base (1 existant + 3 importés)");

  // Nettoyage
  await prisma.ticket.deleteMany({ where: { eventId: event.id } });
  await prisma.ticketCategory.deleteMany({ where: { eventId: event.id } });
  await prisma.event.delete({ where: { id: event.id } });

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
