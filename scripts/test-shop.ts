import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import "dotenv/config";
import { createOrder, simulatePayment, generateSalesSlug, generateReference, isSalesOpen } from "../lib/shop";
import { formatFcfa } from "../lib/format";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || "file:./dev.db",
  }),
});

let ok = 0;
let ko = 0;

function assert(name: string, cond: boolean) {
  if (cond) {
    ok++;
    console.log(`  ✅ ${name}`);
  } else {
    ko++;
    console.log(`  ❌ ${name}`);
  }
}

async function main() {
  console.log("🧪 Test billetterie en ligne");

  const organizer = await prisma.user.findFirst({ where: { role: "ORGANIZER" } });
  const event = await prisma.event.findFirst({ where: { organizerId: organizer!.id } });
  if (!event) {
    console.log("❌ aucun événement — lancez npm run db:seed");
    process.exit(1);
  }
  const category = await prisma.ticketCategory.findFirst({ where: { eventId: event.id } });
  if (!category) {
    console.log("❌ aucune catégorie");
    process.exit(1);
  }

  // --- 1. Référence + format ---
  console.log("\n📦 Références & slug");
  const ref = generateReference();
  assert("référence au format SIG-XXXXXX", /^SIG-[A-Z2-9]{6}$/.test(ref));
  const slug = await generateSalesSlug(event.id, "Soirée Nouvel An à Cotonou");
  assert("slug lisible sans accents", /^soiree-nouvel-an-a-cotonou-[a-z0-9]{4}$/.test(slug));
  assert("formatFcfa", formatFcfa(15000).replace(/\s/g, " ") === "15 000 FCFA");

  // --- 2. Création de commande ---
  console.log("\n🛒 Création de commande");
  const order = await createOrder({
    eventId: event.id,
    categoryId: category.id,
    customerName: "Test Client",
    customerPhone: "90123456",
    customerEmail: "client@exemple.com",
  });
  assert("commande créée (PENDING)", order.ok && typeof order.orderId === "string");
  if (order.ok) {
    const db = await prisma.order.findUnique({ where: { id: order.orderId } });
    assert("montant = prix de la catégorie", db?.amount === category.price);
    assert("statut PENDING", db?.status === "PENDING");
    assert("email enregistré", db?.customerEmail === "client@exemple.com");
  }

  // --- 3. Paiement simulé → billet émis ---
  console.log("\n💳 Paiement simulé");
  if (order.ok) {
    const paid = await simulatePayment(order.orderId);
    assert("paiement validé", paid.ok);
    const db = await prisma.order.findUnique({
      where: { id: order.orderId },
      include: { tickets: true },
    });
    assert("statut PAID", db?.status === "PAID");
    assert("méthode par défaut MOMO_DEMO", db?.paymentMethod === "MOMO_DEMO");
    assert("référence facture", db?.reference?.startsWith("SIG-") === true);
    assert("billet émis avec le nom du client", db?.tickets?.[0]?.guestName === "Test Client");
    assert("billet rattaché à la catégorie", db?.tickets?.[0]?.categoryId === category.id);
    assert("montant = prix unitaire × quantité", db?.amount === category.price && db?.quantity === 1);

    // Idempotence : re-payer → pas de 2e billet
    const db2 = await prisma.order.findUnique({ where: { id: order.orderId } });
    const ticketsAfter = await prisma.ticket.count({ where: { eventId: event.id } });
    await simulatePayment(order.orderId);
    const ticketsAfter2 = await prisma.ticket.count({ where: { eventId: event.id } });
    assert("re-paiement idempotent (pas de 2e billet)", ticketsAfter2 === ticketsAfter && db2?.status === "PAID" === true);
  }

  // --- 4. Quantité : une commande = plusieurs billets ---
  console.log("\n🔢 Quantité");
  const multi = await createOrder({
    eventId: event.id,
    categoryId: category.id,
    customerName: "Test Groupe",
    customerPhone: "90654321",
    quantity: 3,
  });
  assert("commande multi-billets créée", multi.ok);
  if (multi.ok) {
    const db = await prisma.order.findUnique({ where: { id: multi.orderId } });
    assert("quantité enregistrée (3)", db?.quantity === 3);
    assert("montant = prix × 3", db?.amount === category.price * 3);
    const paid = await simulatePayment(multi.orderId);
    assert("paiement multi validé", paid.ok);
    const after = await prisma.order.findUnique({ where: { id: multi.orderId }, include: { tickets: true } });
    assert("3 billets émis pour 3 places", after?.tickets.length === 3);
    assert("billets liés à la commande", after?.tickets.every((t) => t.orderId === multi.orderId) === true);
    await prisma.order.deleteMany({ where: { id: multi.orderId } });
    await prisma.ticket.deleteMany({ where: { guestName: "Test Groupe", eventId: event.id } });
  }

  // --- 5. Réseau mobile money choisi ---
  console.log("\n📱 Réseau mobile money");
  const netOrder = await createOrder({
    eventId: event.id,
    categoryId: category.id,
    customerName: "Test Moov",
    customerPhone: "90556677",
  });
  assert("commande créée", netOrder.ok);
  if (netOrder.ok) {
    const paidNet = await simulatePayment(netOrder.orderId, "MOOV_MONEY");
    assert("paiement Moov validé", paidNet.ok);
    const dbNet = await prisma.order.findUnique({ where: { id: netOrder.orderId } });
    assert("méthode enregistrée MOOV_MONEY_DEMO", dbNet?.paymentMethod === "MOOV_MONEY_DEMO");
    await prisma.order.deleteMany({ where: { id: netOrder.orderId } });
    await prisma.ticket.deleteMany({ where: { guestName: "Test Moov", eventId: event.id } });
  }

  // --- 6. Validation des entrées ---
  console.log("\n⚠️ Validation");
  const bad = await createOrder({
    eventId: event.id,
    categoryId: category.id,
    customerName: "  ",
    customerPhone: "123",
  });
  assert("nom vide refusé", !bad.ok && bad.error === "INVALID_INPUT");
  const badCat = await createOrder({
    eventId: event.id,
    categoryId: "fake-id",
    customerName: "Aya",
    customerPhone: "90123456",
  });
  assert("catégorie inconnue refusée", !badCat.ok && badCat.error === "CATEGORY_NOT_FOUND");

  // --- 7. Capacité ---
  console.log("\n🚦 Capacité");
  const cat = await prisma.ticketCategory.findUnique({ where: { id: category.id } });
  const sold = await prisma.ticket.count({ where: { eventId: event.id, categoryId: category.id } });
  if (cat && sold < cat.capacity) {
    // Remplit la catégorie jusqu'à la capacité (par lots, sans toucher aux billets existants)
    const toCreate = cat.capacity - sold;
    const bulk: Array<{ eventId: string; categoryId: string; code: string; guestName: string; guestPhone: string }> = [];
    for (let i = 0; i < toCreate; i++) {
      bulk.push({
        eventId: event.id,
        categoryId: category.id,
        code: `TEST-FILL-${i}-${Date.now()}`,
        guestName: `Remplissage ${i}`,
        guestPhone: `9000000${i % 10}${i % 7}`,
      });
    }
    for (let i = 0; i < bulk.length; i += 100) {
      await prisma.ticket.createMany({ data: bulk.slice(i, i + 100) });
    }
  }
  const full = await createOrder({
    eventId: event.id,
    categoryId: category.id,
    customerName: "Dernier Client",
    customerPhone: "90765432",
  });
  assert("catégorie pleine → SOLD_OUT", !full.ok && full.error === "SOLD_OUT");

  // Quantité supérieure aux places restantes → NOT_ENOUGH_SEATS
  const catAfter = await prisma.ticketCategory.findUnique({ where: { id: category.id } });
  const soldAfter = await prisma.ticket.count({ where: { eventId: event.id, categoryId: category.id } });
  const remaining = catAfter ? catAfter.capacity - soldAfter : 0;
  const tooMany = await createOrder({
    eventId: event.id,
    categoryId: category.id,
    customerName: "Trop",
    customerPhone: "90888888",
    quantity: Math.max(2, remaining + 1),
  });
  assert(
    "quantité > places restantes → NOT_ENOUGH_SEATS",
    !tooMany.ok && (tooMany.error === "NOT_ENOUGH_SEATS" || tooMany.error === "SOLD_OUT")
  );

  // Nettoyage des billets de remplissage (sauf la commande test)
  await prisma.ticket.deleteMany({ where: { code: { startsWith: "TEST-FILL-" } } });
  if (order.ok) {
    await prisma.order.deleteMany({ where: { id: order.orderId } });
    await prisma.ticket.deleteMany({ where: { guestName: "Test Client", eventId: event.id } });
  }
  await prisma.order.deleteMany({ where: { customerName: "Trop" } });

  // ── Cycle de vie + vente à la porte (isSalesOpen) ──
  type SalesWindow = Parameters<typeof isSalesOpen>[0];
  const mk = (over: Partial<SalesWindow>): SalesWindow => ({
    salesOpen: true,
    date: new Date(Date.now() - 2 * 3600_000),
    endDate: new Date(Date.now() + 6 * 3600_000),
    status: "LIVE",
    salesAtDoor: true,
    ...over,
  });
  assert("vente ouverte (LIVE + vente à la porte)", isSalesOpen(mk({})));
  assert("brouillon → fermé", !isSalesOpen(mk({ status: "DRAFT" })));
  assert("terminé → fermé", !isSalesOpen(mk({ status: "DONE" })));
  assert("fermé par l'organisateur", !isSalesOpen(mk({ salesOpen: false })));
  assert(
    "sans vente à la porte + commencé → fermé",
    !isSalesOpen(mk({ salesAtDoor: false }))
  );
  assert(
    "sans vente à la porte + pas commencé → ouvert",
    isSalesOpen(
      mk({ salesAtDoor: false, date: new Date(Date.now() + 3600_000), endDate: new Date(Date.now() + 9 * 3600_000) })
    )
  );

  // ── Limite d'achat (maxPerCustomer) appliquée par createOrder ──
  const org = await prisma.user.findFirst({ where: { role: "ORGANIZER" } });
  const limitEv = await prisma.event.create({
    data: {
      organizerId: org!.id,
      name: "Test Limite",
      location: "Cotonou",
      date: new Date(Date.now() + 86400_000 * 5),
      capacity: 100,
      status: "LIVE",
      salesSlug: `test-limite-${Date.now()}`,
      maxPerCustomer: 2,
    },
  });
  const limitCat = await prisma.ticketCategory.create({
    data: { eventId: limitEv.id, name: "Standard", capacity: 100, price: 1000 },
  });
  const limited = await createOrder({
    eventId: limitEv.id,
    categoryId: limitCat.id,
    quantity: 9,
    customerName: "Limite Client",
    customerPhone: "97668899",
  });
  assert("commande créée malgré quantité > limite", limited.ok === true);
  if (limited.ok) {
    const saved = await prisma.order.findUnique({ where: { id: limited.orderId } });
    assert("quantité bornée à maxPerCustomer (2)", saved?.quantity === 2);
    assert("montant recalculé (2 × 1000)", saved?.amount === 2000);
    await prisma.order.delete({ where: { id: limited.orderId } });
  }
  await prisma.ticketCategory.delete({ where: { id: limitCat.id } });
  await prisma.event.delete({ where: { id: limitEv.id } });

  console.log(`\n${ok}/${ok + ko} tests réussis`);
  process.exit(ko > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
