import { PrismaClient as SqlitePrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient as PgPrismaClient } from "../app/generated/prisma-pg/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { InvitationStatus, DeliveryMethod } from "../app/generated/prisma/enums";
import bcrypt from "bcrypt";
import "dotenv/config";

// Sélection du moteur selon DATABASE_URL (identique à lib/prisma.ts) :
//  - file:… → SQLite (dev local + tests)
//  - postgresql://… → PostgreSQL (production — Supabase)
const isPostgres =
  process.env.DATABASE_URL?.startsWith("postgresql://") ||
  process.env.DATABASE_URL?.startsWith("postgres://");

// Les deux clients générés sont structurellement identiques (mêmes modèles) :
// on expose le type SQLite comme type canonique pour le reste du seed.
const prisma: SqlitePrismaClient = isPostgres
  ? (new PgPrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
    }) as unknown as SqlitePrismaClient)
  : new SqlitePrismaClient({
      adapter: new PrismaBetterSqlite3({
        url: process.env.DATABASE_URL || "file:./dev.db",
      }),
    });

// Hash identique à lib/auth.ts (bcrypt) — ⚠️ ne PAS utiliser de fonction maison,
// la connexion vérifie avec bcrypt.compare. Corrige aussi les PINs existants.
function hashPin(pin: string): string {
  return bcrypt.hashSync(pin, 10);
}

async function main() {
  console.log("🌱 Seed Sigma Security...");

  // Super admin (plateforme)
  await prisma.user.upsert({
    where: { phone: "96000000" },
    update: { pin: hashPin("1234"), commissionRate: 3 },
    create: {
      name: "Administrateur Sigma",
      phone: "96000000",
      pin: hashPin("1234"),
      role: "SUPER_ADMIN",
      commissionRate: 3,
    },
  });

  // Organisateur
  const organizer = await prisma.user.upsert({
    where: { phone: "97000000" },
    update: { pin: hashPin("1234"), commissionRate: 3 },
    create: {
      name: "Aïcha Zinsou",
      phone: "97000000",
      pin: hashPin("1234"),
      role: "ORGANIZER",
      commissionRate: 3,
    },
  });

  // Second organisateur (pour l'espace admin : blocage, commissions…)
  await prisma.user.upsert({
    where: { phone: "97554433" },
    update: { pin: hashPin("1234"), commissionRate: 3 },
    create: {
      name: "Habib Alladé",
      phone: "97554433",
      pin: hashPin("1234"),
      role: "ORGANIZER",
      commissionRate: 3,
    },
  });

  // Agents
  const rachidi = await prisma.user.upsert({
    where: { phone: "97112233" },
    update: { pin: hashPin("1234") },
    create: { name: "Rachidi Agbessi", phone: "97112233", pin: hashPin("1234"), role: "AGENT" },
  });
  const ismael = await prisma.user.upsert({
    where: { phone: "97223344" },
    update: { pin: hashPin("1234") },
    create: { name: "Ismaël Houéssou", phone: "97223344", pin: hashPin("1234"), role: "AGENT" },
  });

  // Événement de démo — date « live » (commencé il y a 2 h) pour que les scans
  // passent la validité temporelle [début − 2 h, fin] lors des démos et tests.
  const demoStart = new Date(Date.now() - 2 * 3600_000);
  const event = await prisma.event.upsert({
    where: { id: "demo-event" },
    update: {
      date: demoStart,
      salesSlug: "gbediga-vodoun-night",
      capacity: 1000,
      description:
        "Une nuit exceptionnelle de vodoun, de rythmes traditionnels et d'artistes béninois. Danses, percussions et ambiance électrique au cœur de Cotonou.",
      imageUrl:
        "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=1200&q=70",
      doorsOpen: "18:00",
      contactName: "Aïcha Zinsou",
      contactPhone: "97000000",
      salesAtDoor: true,
      maxPerCustomer: 10,
      mode: "COMBINED",
    },
    create: {
      id: "demo-event",
      organizerId: organizer.id,
      name: "Concert Gbèdiga — Vodoun Night",
      type: "Concert",
      location: "Palais des Congrès, Cotonou",
      date: demoStart,
      capacity: 1000,
      status: "LIVE",
      mode: "COMBINED",
      salesSlug: "gbediga-vodoun-night",
      description:
        "Une nuit exceptionnelle de vodoun, de rythmes traditionnels et d'artistes béninois. Danses, percussions et ambiance électrique au cœur de Cotonou.",
      imageUrl:
        "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?auto=format&fit=crop&w=1200&q=70",
      doorsOpen: "18:00",
      contactName: "Aïcha Zinsou",
      contactPhone: "97000000",
      salesAtDoor: true,
      maxPerCustomer: 10,
    },
  });

  const vip = await prisma.ticketCategory.upsert({
    where: { id: "demo-vip" },
    update: { price: 15000 },
    create: { id: "demo-vip", eventId: event.id, name: "VIP", capacity: 150, price: 15000, color: "#f59e0b" },
  });
  const standard = await prisma.ticketCategory.upsert({
    where: { id: "demo-standard" },
    update: { price: 5000 },
    create: { id: "demo-standard", eventId: event.id, name: "Standard", capacity: 850, price: 5000, color: "#10b981" },
  });

  // Assigner les agents à l'événement
  await prisma.eventAgent.upsert({
    where: { eventId_agentId: { eventId: event.id, agentId: rachidi.id } },
    update: {},
    create: { eventId: event.id, agentId: rachidi.id },
  });
  await prisma.eventAgent.upsert({
    where: { eventId_agentId: { eventId: event.id, agentId: ismael.id } },
    update: {},
    create: { eventId: event.id, agentId: ismael.id },
  });

  // Billets / invitations de démo — cycle de vie varié (GÉNÉRÉE → ENVOYÉE → OUVERTE → CONFIRMÉE → ENTRÉE)
  const guests: Array<{
    name: string;
    phone: string;
    email: string | null;
    cat: string;
    code: string;
    status: InvitationStatus;
    count: number;
    entries: number;
  }> = [
    {
      name: "Aya Hounkpatin",
      phone: "97123456",
      email: "aya@exemple.com",
      cat: vip.id,
      code: "DEMO-VIP-0001",
      status: InvitationStatus.ENTERED,
      count: 1,
      entries: 1,
    },
    {
      name: "Junior Agbodjan",
      phone: "66789012",
      email: "junior@exemple.com",
      cat: standard.id,
      code: "DEMO-STD-0001",
      status: InvitationStatus.SENT,
      count: 1,
      entries: 0,
    },
    {
      name: "Fati Zannou",
      phone: "95401122",
      email: "fati@exemple.com",
      cat: vip.id,
      code: "DEMO-VIP-0002",
      status: InvitationStatus.OPENED,
      count: 2,
      entries: 1,
    },
    {
      name: "Romaric Dossou",
      phone: "90218765",
      email: null,
      cat: standard.id,
      code: "DEMO-STD-0002",
      status: InvitationStatus.CONFIRMED,
      count: 1,
      entries: 0,
    },
    {
      name: "Grâce Tchibozo",
      phone: "94556677",
      email: "grace@exemple.com",
      cat: standard.id,
      code: "DEMO-STD-0003",
      status: InvitationStatus.GENERATED,
      count: 4,
      entries: 0,
    },
    {
      name: "Karl Adjovi",
      phone: "61234567",
      email: null,
      cat: vip.id,
      code: "DEMO-VIP-0003",
      status: InvitationStatus.CANCELLED,
      count: 1,
      entries: 0,
    },
  ];
  for (const g of guests) {
    const entryCount = Math.min(g.count, g.entries || 0);
    await prisma.ticket.upsert({
      where: { code: g.code },
      update: {
        guestEmail: g.email,
        guestCount: g.count,
        entriesCount: entryCount,
        inviteStatus: g.status,
        status: g.status === "ENTERED" ? "ENTERED" : "ISSUED",
      },
      create: {
        code: g.code,
        eventId: event.id,
        categoryId: g.cat,
        guestName: g.name,
        guestPhone: g.phone,
        guestEmail: g.email,
        guestCount: g.count,
        entriesCount: entryCount,
        inviteStatus: g.status,
        status: g.status === "ENTERED" ? "ENTERED" : "ISSUED",
      },
    });
  }

  // Nettoyage des commandes/billets de test précédents (pour une démo propre)
  await prisma.ticket.deleteMany({ where: { guestName: "Test Browser" } });
  await prisma.order.deleteMany({ where: { customerName: "Test Browser" } });

  // Ventes de démonstration (pour le profil « chiffre d'affaires »)
  const demoSales = [
    { name: "Aya Hounkpatin", phone: "97123456", email: "aya@exemple.com", cat: vip, daysAgo: 3 },
    { name: "Junior Agbodjan", phone: "66789012", email: "junior@exemple.com", cat: standard, daysAgo: 2 },
    { name: "Fati Zannou", phone: "95401122", email: "fati@exemple.com", cat: vip, daysAgo: 1 },
    { name: "Romaric Dossou", phone: "90218765", email: null, cat: standard, daysAgo: 1 },
  ];
  // Nettoyage des anciennes ventes démo (migration ticketId → orderId) : ne supprime QUE les
  // billets de vente orphelins (codes UUID), jamais les billets démo DEMO-*.
  await prisma.order.deleteMany({ where: { reference: { startsWith: "SIG-DEMO" } } });
  await prisma.ticket.deleteMany({
    where: {
      orderId: null,
      guestName: { in: demoSales.map((s) => s.name) },
      NOT: { code: { startsWith: "DEMO-" } },
    },
  });
  for (const s of demoSales) {
    const soldAt = new Date(Date.now() - s.daysAgo * 24 * 3600_000);
    const orderRef = `SIG-DEMO${String(s.daysAgo).padStart(2, "0")}${s.cat.id === vip.id ? "V" : "S"}`;
    const exists = await prisma.order.findUnique({ where: { reference: orderRef } });
    if (!exists) {
      const ticket = await prisma.ticket.create({
        data: {
          eventId: event.id,
          categoryId: s.cat.id,
          code: crypto.randomUUID().replace(/-/g, ""),
          guestName: s.name,
          guestPhone: s.phone,
        },
      });
      const deliveryOptions: Array<{ method: DeliveryMethod; fee: number }> = [
        { method: DeliveryMethod.WHATSAPP, fee: 75 },
        { method: DeliveryMethod.EMAIL, fee: 25 },
        { method: DeliveryMethod.DOWNLOAD, fee: 0 },
      ];
      const delivery = deliveryOptions[s.daysAgo % deliveryOptions.length];
      await prisma.order.create({
        data: {
          reference: orderRef,
          eventId: event.id,
          categoryId: s.cat.id,
          customerName: s.name,
          customerPhone: s.phone,
          customerEmail: s.email,
          amount: s.cat.price,
          quantity: 1,
          status: "PAID",
          paymentMethod: "MOMO_DEMO",
          deliveryMethod: delivery.method,
          deliveryFee: delivery.fee,
          paidAt: soldAt,
          createdAt: soldAt,
          tickets: { connect: { id: ticket.id } },
        },
      });
    }
  }

  console.log("✅ Seed terminé !");
  console.log("   Super admin  : +229 96 00 00 00 / PIN 1234 (/admin)");
  console.log("   Organisateur : +229 97 00 00 00 / PIN 1234");
  console.log("   Agent        : +229 97 11 22 33 / PIN 1234 (ou 97 22 33 44)");
  console.log("   Événement    : Concert Gbèdiga (demo-event) — mode combiné (vente + invitations)");
  console.log("   Billets test : DEMO-VIP-0001 à DEMO-VIP-0003 (cycle de vie varié)");
  console.log("   Invitation   : http://localhost:3000/i/DEMO-STD-0001 (ouvre → statut « Ouverte »)");
  console.log("   Boutique     : http://localhost:3000/acheter/gbediga-vodoun-night (VIP 15 000 F / Standard 5 000 F)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
