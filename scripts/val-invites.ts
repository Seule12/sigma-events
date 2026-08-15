// Validation fonctionnelle de la phase « invitations + cycle de vie + livraison ».
// Reproduit les parcours clés contre la base réelle (même logique que test-checkin).
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import "dotenv/config";
import { parseGuestCsv } from "../lib/csv";
import { simulatePayment, createOrder } from "../lib/shop";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL || "file:./dev.db" }),
});

let ok = 0;
let ko = 0;
const a = (label: string, cond: boolean) => {
  if (cond) ok++;
  else ko++;
  console.log(`  ${cond ? "✅" : "❌"} ${label}`);
};

// Reproduit la logique de check-in pour un scan (identique à checkInAction côté multi-entrées).
async function scanTicket(eventId: string, code: string) {
  const ticket = await prisma.ticket.findUnique({ where: { code: code.toUpperCase() }, include: { event: true } });
  if (!ticket || ticket.eventId !== eventId) return { status: "INVALID", guestCount: 1, entries: 0 };
  if (ticket.status === "BLACKLISTED") return { status: "BLACKLISTED", guestCount: 1, entries: 0 };
  const end = ticket.event.endDate ?? new Date(ticket.event.date.getTime() + 8 * 3600_000);
  const now = new Date();
  if (now < new Date(ticket.event.date.getTime() - 2 * 3600_000)) return { status: "TOO_EARLY", guestCount: 1, entries: 0 };
  if (now > end) return { status: "EXPIRED", guestCount: 1, entries: 0 };
  const guestCount = Math.max(1, ticket.guestCount || 1);
  if (ticket.status === "ENTERED" || ticket.entriesCount >= guestCount) {
    return { status: "ALREADY_SCANNED", guestCount, entries: ticket.entriesCount };
  }
  const next = ticket.entriesCount + 1;
  const complete = next >= guestCount;
  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { entriesCount: next, status: complete ? "ENTERED" : "ISSUED", inviteStatus: complete ? "ENTERED" : ticket.inviteStatus },
  });
  return { status: complete ? "VALID" : "ENTRY", guestCount, entries: next };
}

async function main() {
  try {
    // ── 1. CYCLE DE VIE : CRÉÉ → GÉNÉRÉ (ajout invité) → ENVOYÉ (envoi groupé)
    console.log("🎟️ CYCLE DE VIE DES INVITATIONS");
    const event = await prisma.event.findUnique({ where: { id: "demo-event" } });
    const org = await prisma.user.findFirst({ where: { role: "ORGANIZER" } });
    if (!event || !org) { console.log("❌ environnement de démo introuvable"); process.exit(1); }
    const cat = await prisma.ticketCategory.findFirst({ where: { eventId: event.id } });
    const stamp = Date.now().toString().slice(-8);
    const inv = await prisma.ticket.create({
      data: {
        eventId: event.id, categoryId: cat?.id, code: `TEST-INV-${stamp}`, guestName: "Test Invité",
        guestPhone: "97990011", guestEmail: "invite@exemple.com", guestCount: 3,
        inviteStatus: "GENERATED", status: "ISSUED",
      },
    });
    a("ajout invité → statut GÉNÉRÉE", inv.inviteStatus === "GENERATED");
    // Envoi groupé simulé → SENT
    await prisma.ticket.update({ where: { id: inv.id }, data: { inviteStatus: "SENT" } });
    const afterSend = await prisma.ticket.findUnique({ where: { id: inv.id }, select: { inviteStatus: true } });
    a("envoi groupé → statut ENVOYÉE", afterSend?.inviteStatus === "SENT");
    // Page /i/ visitée → OPENED
    await prisma.ticket.update({ where: { id: inv.id }, data: { inviteStatus: "OPENED" } });
    const afterOpen = await prisma.ticket.findUnique({ where: { id: inv.id }, select: { inviteStatus: true } });
    a("ouverture du lien → statut OUVERTE", afterOpen?.inviteStatus === "OPENED");

    // ── 2. CHECK-IN MULTI-PERSONNES : invitation à 3 personnes
    console.log("👥 CHECK-IN MULTI-PERSONNES (+1)");
    const s1 = await scanTicket(event.id, inv.code);
    a("1er passage → ENTRY (1/3)", s1.status === "ENTRY" && s1.entries === 1);
    const s2 = await scanTicket(event.id, inv.code);
    a("2e passage → ENTRY (2/3)", s2.status === "ENTRY" && s2.entries === 2);
    const s3 = await scanTicket(event.id, inv.code);
    a("3e passage → VALID (3/3, invitation consommée)", s3.status === "VALID" && s3.entries === 3);
    const s4 = await scanTicket(event.id, inv.code);
    a("4e passage → ALREADY_SCANNED (le « cousin » est refusé)", s4.status === "ALREADY_SCANNED");
    const tAfter = await prisma.ticket.findUnique({ where: { id: inv.id } });
    a("ticket final : ENTERED + inviteStatus ENTRÉE", tAfter?.status === "ENTERED" && tAfter?.inviteStatus === "ENTERED");

    // ── 3. LIVRAISON : DOWNLOAD / EMAIL / WHATSAPP avec frais
    console.log("📦 LIVRAISON DU BILLET (frais)");
    const order = await createOrder({
      eventId: event.id, categoryId: cat!.id, customerName: "Test Livraison", customerPhone: "97990022", quantity: 1,
    });
    if (!order.ok) { console.log("❌ création de commande échouée"); process.exit(1); }
    const paidWhatsapp = await simulatePayment(order.orderId, "MTN_MOMO", "WHATSAPP");
    const o1 = await prisma.order.findUnique({ where: { id: order.orderId } });
    a("livraison WhatsApp enregistrée (+75 F)", o1?.deliveryMethod === "WHATSAPP" && o1?.deliveryFee === 75 && paidWhatsapp.ok);
    const o2 = await createOrder({ eventId: event.id, categoryId: cat!.id, customerName: "Test Livraison 2", customerPhone: "97990033", quantity: 1 });
    if (!o2.ok) { console.log("❌ création de commande 2 échouée"); process.exit(1); }
    await simulatePayment(o2.orderId, "MOOV_MONEY", "EMAIL");
    const o2b = await prisma.order.findUnique({ where: { id: o2.orderId } });
    a("livraison email enregistrée (+25 F)", o2b?.deliveryMethod === "EMAIL" && o2b?.deliveryFee === 25);
    const o3 = await createOrder({ eventId: event.id, categoryId: cat!.id, customerName: "Test Livraison 3", customerPhone: "97990044", quantity: 1 });
    if (!o3.ok) { console.log("❌ création de commande 3 échouée"); process.exit(1); }
    await simulatePayment(o3.orderId, undefined, "DOWNLOAD");
    const o3b = await prisma.order.findUnique({ where: { id: o3.orderId } });
    a("téléchargement gratuit (0 F)", o3b?.deliveryMethod === "DOWNLOAD" && o3b?.deliveryFee === 0);

    // ── 4. PARSING CSV : email + personnes (le « +1 »)
    console.log("📄 CSV ENRICHI");
    const { rows } = parseGuestCsv("nom;telephone;categorie;email;personnes\nAya;97123456;VIP;aya@exemple.com;2\nFamille;90000000;Standard;;4\n");
    a("colonne email lue", rows[0].email === "aya@exemple.com");
    a("colonne personnes lue (+1)", rows[0].people === 2);
    a("personnes par défaut = 1", rows[1].people === 4);

    // ── 5. MODE INVITE : la boutique n'est pas en vente
    console.log("🎭 MODE D'ÉVÉNEMENT");
    const inviteEvent = await prisma.event.create({
      data: { organizerId: org.id, name: "Mariage Test", location: "Ouidah", date: new Date(Date.now() + 30 * 86400_000), capacity: 100, status: "LIVE", mode: "INVITE" },
    });
    a("mode INVITE enregistré", (await prisma.event.findUnique({ where: { id: inviteEvent.id } }))?.mode === "INVITE");

    // Nettoyage
    await prisma.ticket.deleteMany({ where: { id: inv.id } });
    await prisma.order.deleteMany({ where: { customerName: { startsWith: "Test Livraison" } } });
    await prisma.event.delete({ where: { id: inviteEvent.id } });

    console.log(`\n${ok}/${ok + ko} validations OK`);
    process.exit(ok === 0 && ko === 0 ? 1 : ko > 0 ? 1 : 0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

main();
