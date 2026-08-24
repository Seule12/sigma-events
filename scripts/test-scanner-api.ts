// Test E2E de l'API SIGMA Scanner (backend) :
//  prépare un événement + billet + agent + terminal, puis exerce :
//    POST /api/scanner/activate  (téléphone + PIN + code d'activation)
//    GET  /api/scanner/bootstrap (token → données offline)
//    POST /api/scanner/check     (validation temps réel : valide, déjà utilisé, invalide)
//    POST /api/scanner/sync      (scans hors-ligne → résolution de conflits)
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import "dotenv/config";

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL }),
});

const BASE = process.env.APP_URL || "http://localhost:3000";
const AGENT_PHONE = "60123456";
const AGENT_PIN = "4321";

let ok = 0;
let ko = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) {
    ok++;
    console.log(`  ✅ ${label}`);
  } else {
    ko++;
    console.log(`  ❌ ${label} ${detail}`);
  }
}

async function api(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function main() {
  console.log("=== Préparation des données de test ===");

  // 1. Organisateur + événement de test
  let organizer = await prisma.user.findUnique({ where: { phone: "90000000" } });
  if (!organizer) {
    organizer = await prisma.user.create({
      data: { name: "Org Test Scanner", phone: "90000000", pin: bcrypt.hashSync("1111", 10), role: "ORGANIZER" },
    });
  }

  let event = await prisma.event.findFirst({ where: { name: "Festival Sigma Test" } });
  if (!event) {
    const date = new Date();
    date.setHours(date.getHours() + 1); // dans 1h → dans la plage [début − 2h, fin]
    event = await prisma.event.create({
      data: {
        organizerId: organizer.id,
        name: "Festival Sigma Test",
        location: "Palais des Congrès",
        date,
        capacity: 500,
        status: "LIVE",
        mode: "PUBLIC",
      },
    });
    await prisma.ticketCategory.create({ data: { eventId: event.id, name: "VIP", capacity: 200, price: 15000, zones: "main,vip" } });
    await prisma.ticketCategory.create({ data: { eventId: event.id, name: "Standard", capacity: 300, price: 5000, zones: "main" } });
  } else {
    // Date rafraîchie à chaque run : garantit que le billet test est dans la plage
    // de validation [début − 2h, fin] (sinon le scan renvoie TOO_EARLY).
    const date = new Date();
    date.setHours(date.getHours() + 1);
    event = await prisma.event.update({ where: { id: event.id }, data: { date } });
  }

  // 2. Billet test (code QR connu) — réinitialisé à chaque run pour être rejouable.
  const TICKET_CODE = "SIG-TEST-SCANNER-0001";
  // Les checkIns INVALID ont ticketId null : on purge aussi les syncIds de test.
  await prisma.checkIn.deleteMany({ where: { OR: [{ ticket: { code: TICKET_CODE } }, { syncId: { in: ["sync-e2e-1", "sync-e2e-2"] } }] } });
  let ticket = await prisma.ticket.findUnique({ where: { code: TICKET_CODE } });
  if (!ticket) {
    const cat = await prisma.ticketCategory.findFirst({ where: { eventId: event.id, name: "VIP" } });
    ticket = await prisma.ticket.create({
      data: { eventId: event.id, categoryId: cat?.id, code: TICKET_CODE, guestName: "Aya Hounkpatin", guestCount: 1, status: "ISSUED" },
    });
  } else {
    ticket = await prisma.ticket.update({
      where: { id: ticket.id },
      data: { status: "ISSUED", entriesCount: 0 },
    });
  }

  // 3. Agent de test
  let agent = await prisma.user.findUnique({ where: { phone: AGENT_PHONE } });
  if (!agent) {
    agent = await prisma.user.create({
      data: { name: "Agent Paul", phone: AGENT_PHONE, pin: bcrypt.hashSync(AGENT_PIN, 10), role: "AGENT" },
    });
  }
  const assignment = await prisma.eventAgent.findUnique({
    where: { eventId_agentId: { eventId: event.id, agentId: agent.id } },
  });
  if (!assignment) {
    await prisma.eventAgent.create({ data: { eventId: event.id, agentId: agent.id } });
  }

  // 4. Terminal + identifiant d'activation (code T-XXXX, permanent)
  let terminal = await prisma.terminal.findFirst({ where: { eventId: event.id, name: "Porte A — Entrée principale" } });
  if (!terminal) {
    terminal = await prisma.terminal.create({
      data: {
        eventId: event.id,
        name: "Porte A — Entrée principale",
        zone: "main",
        code: `T-${Math.floor(1000 + Math.random() * 9000)}`,
        status: "INACTIVE",
      },
    });
  } else {
    // Le terminal existe déjà (run précédent) : on repasse INACTIVE pour pouvoir
    // re-tester l'activation de bout en bout (l'identifiant T-XXXX ne change pas).
    terminal = await prisma.terminal.update({
      where: { id: terminal.id },
      data: { status: "INACTIVE", token: null, tokenExpiresAt: null, agentId: null },
    });
  }

  const terminalCode = terminal.code;
  console.log(`  Événement: ${event.name} (${event.id})`);
  console.log(`  Terminal: ${terminal.code} — identifiant d'activation ${terminalCode}`);
  console.log(`  Billet: ${TICKET_CODE} — ${ticket.guestName}`);
  console.log(`  Agent: ${agent.name} (${AGENT_PHONE} / ${AGENT_PIN})`);

  console.log("\n=== Test du flux d'activation ===");

  // 4.1 Code manquant → 400
  const noCode = await api("/api/scanner/activate", { method: "POST", body: JSON.stringify({ phone: AGENT_PHONE, pin: AGENT_PIN }) });
  check("activation sans code → 400", noCode.status === 400);

  // 4.2 Mauvais PIN → 401
  const badPin = await api("/api/scanner/activate", { method: "POST", body: JSON.stringify({ code: terminalCode, phone: AGENT_PHONE, pin: "0000" }) });
  check("mauvais PIN agent → 401", badPin.status === 401);

  // 4.3 Mauvais identifiant → 401
  const badCode = await api("/api/scanner/activate", { method: "POST", body: JSON.stringify({ code: "T-0000", phone: AGENT_PHONE, pin: AGENT_PIN }) });
  check("identifiant invalide → 401", badCode.status === 401);

  // 4.4 Activation valide → token + terminal + événement
  const activated = await api("/api/scanner/activate", {
    method: "POST",
    body: JSON.stringify({ code: terminalCode, phone: AGENT_PHONE, pin: AGENT_PIN }),
  });
  check("activation valide → 200", activated.status === 200, `(got ${activated.status})`);
  check("token émis", Boolean(activated.data?.terminal?.token));
  check("terminal ACTIVE", activated.data?.terminal?.status === "ACTIVE");
  check("événement associé", activated.data?.event?.name === "Festival Sigma Test");
  check("agent associé", activated.data?.agent?.name === "Agent Paul");

  const token = activated.data?.terminal?.token;
  if (!token) {
    console.log("\n⚠️  Impossible de continuer sans token — fin du test.");
    console.log(`Résultat : ${ok} ✅ / ${ko} ❌`);
    process.exit(ko > 0 ? 1 : 0);
  }

  console.log("\n=== Bootstrap (téléchargement offline) ===");

  const boot = await api("/api/scanner/bootstrap", { headers: { Authorization: `Bearer ${token}` } });
  check("bootstrap → 200", boot.status === 200);
  check("événement avec urgence", typeof boot.data?.event?.entranceBlocked === "boolean");
  check("billets téléchargés", Array.isArray(boot.data?.tickets) && boot.data.tickets.length > 0);
  check("le billet test est présent", boot.data?.tickets?.some((t: { code: string }) => t.code === TICKET_CODE));
  check("token renouvelé", typeof boot.data?.token === "string" && boot.data.token.length > 0);

  // Le bootstrap renouvelle le token → on utilise le nouveau.
  const freshToken = boot.data?.token ?? token;

  console.log("\n=== Check temps réel (validation serveur) ===");

  const valid = await api("/api/scanner/check", { method: "POST", headers: { Authorization: `Bearer ${freshToken}` }, body: JSON.stringify({ code: TICKET_CODE }) });
  check("billet valide → VALID", valid.data?.status === "VALID", `(got ${valid.data?.status})`);
  check("nom du participant", valid.data?.guestName === "Aya Hounkpatin");

  const again = await api("/api/scanner/check", { method: "POST", headers: { Authorization: `Bearer ${freshToken}` }, body: JSON.stringify({ code: TICKET_CODE }) });
  check("deuxième scan → ALREADY_SCANNED", again.data?.status === "ALREADY_SCANNED", `(got ${again.data?.status})`);

  const fake = await api("/api/scanner/check", { method: "POST", headers: { Authorization: `Bearer ${freshToken}` }, body: JSON.stringify({ code: "SIG-FAKE-000000" }) });
  check("billet inconnu → INVALID", fake.data?.status === "INVALID");

  const noToken = await api("/api/scanner/bootstrap", { headers: {} });
  check("sans token → 401", noToken.status === 401);

  console.log("\n=== Synchronisation hors-ligne (conflits) ===");

  // Billet 2 : scan hors-ligne pour tester la sync.
  const TICKET2 = "SIG-TEST-SCANNER-0002";
  await prisma.checkIn.deleteMany({ where: { OR: [{ ticket: { code: TICKET2 } }, { syncId: { in: ["sync-e2e-1", "sync-e2e-2"] } }] } });
  let t2 = await prisma.ticket.findUnique({ where: { code: TICKET2 } });
  if (!t2) {
    const cat = await prisma.ticketCategory.findFirst({ where: { eventId: event.id, name: "Standard" } });
    t2 = await prisma.ticket.create({
      data: { eventId: event.id, categoryId: cat?.id, code: TICKET2, guestName: "Jean Dupont", guestCount: 1, status: "ISSUED" },
    });
  } else {
    t2 = await prisma.ticket.update({ where: { id: t2.id }, data: { status: "ISSUED", entriesCount: 0 } });
  }

  const syncRes = await api("/api/scanner/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${freshToken}` },
    body: JSON.stringify({
      entries: [
        { syncId: "sync-e2e-1", code: TICKET2, scannedAt: new Date().toISOString() },
        { syncId: "sync-e2e-2", code: "SIG-FAKE-000000", scannedAt: new Date().toISOString() },
      ],
    }),
  });
  check("sync → 200", syncRes.status === 200);
  check("2 scans traités", syncRes.data?.synced === 2, `(synced=${syncRes.data?.synced})`);
  check("syncIds confirmés", Array.isArray(syncRes.data?.processedIds) && syncRes.data.processedIds.length === 2);

  // Anti-rejeu : re-synchroniser le même syncId ne doit rien re-créer.
  const replay = await api("/api/scanner/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${freshToken}` },
    body: JSON.stringify({
      entries: [{ syncId: "sync-e2e-1", code: TICKET2, scannedAt: new Date().toISOString() }],
    }),
  });
  check("anti-rejeu (déjà synchronisé)", replay.data?.alreadySynced === 1, `(already=${replay.data?.alreadySynced})`);

  const checkins = await prisma.checkIn.findMany({ where: { eventId: event.id } });
  check("journal serveur alimenté", checkins.length >= 4, `(${checkins.length} check-ins)`);
  check("source TERMINAL utilisée", checkins.some((c) => c.source === "TERMINAL"));

  console.log(`\nRésultat : ${ok} ✅ / ${ko} ❌`);
  await prisma.$disconnect();
  process.exit(ko > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
