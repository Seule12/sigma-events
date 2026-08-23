// Test de bout en bout : QR chiffré AES-256-GCM.
// 1. Round-trip serveur (encrypt → decrypt)
// 2. Altération → rejet
// 3. Compatibilité Web Crypto (déchiffrement côté app scanner)
// 4. Routes API : /api/agents/authenticate, /api/events/:id/session-key,
//    /api/tickets/verify (avec terminal ACTIVE)

import { encryptTicketQr, decryptTicketQr, deriveEventSessionKey, isEncryptedTicketQr } from "../lib/ticket-crypto";
import { ticketQrContent } from "../lib/qr";

const API = process.env.APP_URL || "http://localhost:3000";
// Base SQLite : `DATABASE_URL` (format `file:./ci.db`) ou défaut local dev.db.
const DB_FILE = (process.env.DATABASE_URL || "file:./dev.db").replace(/^file:/, "");
const EVENT_ID = "demo-event";
const TICKET_ID = "cmsm505i90004ca757vp38vck";
const TICKET_CODE = "C50DAEAFFA914C1CBAB25221BB19E19D";

const results: { name: string; ok: boolean; detail?: string }[] = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? " — " + detail : ""}`);
}

async function main() {
  // ---- 1. Round-trip serveur ----
  const blob = encryptTicketQr({ eventId: EVENT_ID, ticketId: TICKET_ID, plusOne: 0, expiresAt: null });
  // Format v2 : préfixe « 西格玛 » + blob encodé en caractères chinois.
  check("encryptTicketQr produit un blob chinois (西格玛…)", blob.startsWith("西格玛"), blob.slice(0, 30) + "…");
  check("isEncryptedTicketQr détecte le blob", isEncryptedTicketQr(blob));

  // Le blob ne contient QUE des caractères chinois : aucun caractère latin.
  const bodyCn = blob.slice(3);
  check("blob sans caractère latin (tout chinois)", /^[\u4e00-\u4eff]+$/.test(bodyCn), "taille=" + bodyCn.length);

  const payload = decryptTicketQr(blob);
  check(
    "round-trip serveur : ticketId retrouvé",
    payload.ticketId === TICKET_ID && payload.eventId === EVENT_ID,
    `tid=${payload.ticketId}`
  );

  // QR via lib/qr.ts (chemin de production, inclut plusOne)
  const qrContent = ticketQrContent({ id: TICKET_ID, eventId: EVENT_ID, code: TICKET_CODE, guestCount: 1 });
  const p2 = decryptTicketQr(qrContent);
  check("ticketQrContent → decrypt cohérent", p2.ticketId === TICKET_ID);

  // ---- 2. Altération ----
  // On modifie un caractère au milieu du blob (le remplace par un caractère latin) :
  // le décodage chinois échoue (QR_MALFORMED) ou le déchiffrement GCM échoue
  // (QR_INVALID_OR_TAMPERED) — dans les deux cas, le QR est REJETÉ.
  const tampered = blob.slice(0, 20) + "A" + blob.slice(21);
  let tamperCode = "AUCUN";
  try {
    decryptTicketQr(tampered);
  } catch (e: any) {
    tamperCode = e.code;
  }
  check(
    "blob altéré rejeté",
    tamperCode === "QR_MALFORMED" || tamperCode === "QR_INVALID_OR_TAMPERED",
    tamperCode
  );
  try {
    decryptTicketQr("not-a-qr");
    check("entrée non-QR rejetée", false);
  } catch (e: any) {
    check("entrée non-QR rejetée", e.code === "QR_MALFORMED", e.code);
  }

  // ---- 3. Compat Web Crypto (déchiffrement app scanner) ----
  const keyHex = deriveEventSessionKey(EVENT_ID).toString("hex");
  // Node 22 : crypto.subtle disponible globalement.
  const wc = await decryptWithWebCrypto(qrContent, keyHex, EVENT_ID);
  check("Web Crypto déchiffre le blob serveur", wc?.ticketId === TICKET_ID, wc ? wc.ticketId : "null");

  const wcWrong = await decryptWithWebCrypto(qrContent, deriveEventSessionKey("autre-event").toString("hex"), EVENT_ID);
  check("Web Crypto mauvaise clé → null", wcWrong === null);

  // ---- 4. Routes API ----
  // Pré-nettoyage : le rate limiting anti-bruteforce de /agents/authenticate
  // s'accumule entre les runs de test (téléphone + IP) → on vide ses compteurs.
  const Database0 = require("better-sqlite3");
  const db0 = new Database0(DB_FILE);
  db0.prepare("DELETE FROM RateLimitHit WHERE key LIKE 'agent-auth:%'").run();
  db0.close();

  // 4a. session-key : exige un token Bearer (401 attendu sans token)
  try {
    const r = await fetch(`${API}/api/events/${EVENT_ID}/session-key`);
    check("session-key sans token → 401", r.status === 401, `HTTP ${r.status}`);
  } catch (e: any) {
    check("session-key accessible", false, e.message);
  }

  // 4b. agents/authenticate : exige code + téléphone + PIN (401 attendu avec mauvais code)
  try {
    const r = await fetch(`${API}/api/agents/authenticate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "000000", phone: "97000000", pin: "1234" }),
    });
    check("agents/authenticate mauvais code → 401", r.status === 401, `HTTP ${r.status}`);
  } catch (e: any) {
    check("agents/authenticate accessible", false, e.message);
  }

  // 4c. tickets/verify : terminal ACTIVE + QR chiffré
  const { token, terminalId } = await ensureActiveTerminal();
  try {
    const r = await fetch(`${API}/api/tickets/verify`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ qrContent: qrContent, agentId: null }),
    });
    const j = await r.json().catch(() => ({}));
    // Peu importe la décision métier (VALID / ENTRY / TOO_EARLY / …) :
    // ce qui compte, c'est que le pipeline déchiffre → résout → règles fonctionne.
    check("tickets/verify répond structuré", r.status === 200 && typeof j.ok === "boolean", `HTTP ${r.status} → ${JSON.stringify(j).slice(0, 120)}`);
  } catch (e: any) {
    check("tickets/verify joignable", false, e.message);
  }

  // 4d. tickets/verify sans token → 401
  try {
    const r = await fetch(`${API}/api/tickets/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ qrContent: qrContent }),
    });
    check("tickets/verify sans token → 401", r.status === 401, `HTTP ${r.status}`);
  } catch (e: any) {
    check("tickets/verify sans token joignable", false, e.message);
  }

  // ---- 5. Parcours complet : entrée acceptée (événement en cours) ----
  const Database = require("better-sqlite3");
  const db = new Database(DB_FILE);
  const AGENT_ID = "cmsl0owft0001y375vv5nm3mz"; // Rachidi Agbessi (AGENT)
  const originalDate = db.prepare("SELECT date FROM Event WHERE id = ?").get(EVENT_ID)?.date;
  // Décale l'événement pour qu'il soit EN COURS (fenêtre valide)…
  db.prepare("UPDATE Event SET date = ? WHERE id = ?").run(
    new Date(Date.now() - 3600_000).toISOString(),
    EVENT_ID
  );
  // …puis crée un terminal ACTIVE rattaché à l'agent.
  const happyTerminalId = "term-e2e-happy-" + Date.now();
  const happyToken = require("crypto").randomBytes(32).toString("hex");
  db.prepare(
    "INSERT INTO Terminal (id, eventId, name, code, status, token, tokenExpiresAt, zone, agentId, createdAt) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, 'main', ?, ?)"
  ).run(
    happyTerminalId,
    EVENT_ID,
    "Porte E2E",
    "T-HAPPY" + Date.now().toString().slice(-4),
    happyToken,
    new Date(Date.now() + 12 * 3600_000).toISOString(),
    AGENT_ID,
    new Date().toISOString()
  );
  db.close();

  try {
    const r = await fetch(`${API}/api/tickets/verify`, {
      method: "POST",
      headers: { authorization: `Bearer ${happyToken}`, "content-type": "application/json" },
      body: JSON.stringify({ qrContent: qrContent, agentId: null }),
    });
    const j = await r.json().catch(() => ({}));
    check("scan complet → entrée acceptée", r.status === 200 && j.ok === true && (j.status === "VALID" || j.status === "ENTRY"), `HTTP ${r.status} → ${JSON.stringify(j).slice(0, 150)}`);
  } catch (e: any) {
    check("scan complet joignable", false, e.message);
  }

  // Vérifie le journal CheckIn et l'incrément d'entrées, puis restaure tout.
  const db2 = new Database(DB_FILE);
  const checkin = db2.prepare("SELECT id, ticketId, status, source FROM CheckIn WHERE ticketId = ? ORDER BY scannedAt DESC LIMIT 1").get(TICKET_ID);
  check("journal CheckIn créé (entrée)", Boolean(checkin) && (checkin.status === "VALID" || checkin.status === "ENTRY"), checkin ? `${checkin.status} (${checkin.source})` : "aucun");
  db2.prepare("UPDATE Event SET date = ? WHERE id = ?").run(originalDate, EVENT_ID);
  db2.prepare("DELETE FROM Terminal WHERE id IN (?, ?)").run(terminalId, happyTerminalId);
  if (checkin) db2.prepare("DELETE FROM CheckIn WHERE id = ?").run(checkin.id);
  // Restaure le ticket pour rendre le test ré-exécutable (le scan VALID
  // persiste le statut ENTERED + entriesCount — protection anti double-scan).
  db2.prepare("UPDATE Ticket SET status = 'ISSUED', entriesCount = 0 WHERE id = ?").run(TICKET_ID);
  db2.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests OK`);
  process.exit(failed.length ? 1 : 0);
}

// Déchiffrement Web Crypto (équivalent app scanner) — gère le format v2
// « 西格玛… » (chinois → octets) et v1 « S1{eventId}:… » (rétrocompat).
function chineseToClear(str: string): string | null {
  const bytes = Buffer.alloc(str.length);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i) - 0x4e00;
    if (code < 0 || code > 255) return null;
    bytes[i] = code;
  }
  return bytes.toString("utf8");
}

async function decryptWithWebCrypto(qrContent: string, keyHex: string, expectedEventId: string) {
  const raw = qrContent.trim();
  let clear: string | null;
  if (raw.startsWith("西格玛")) {
    clear = chineseToClear(raw.slice(3));
    if (!clear) return null;
  } else if (raw.startsWith("S1")) {
    clear = raw;
  } else {
    return null;
  }
  const sep = clear!.indexOf(":");
  if (sep === -1) return null;
  const eventId = raw.startsWith("西格玛") ? clear!.slice(0, sep) : clear!.slice(2, sep);
  if (eventId !== expectedEventId) return null;
  const b64 = clear.slice(sep + 1).replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const buf = Buffer.from(padded, "base64");
  const iv = buf.subarray(0, 12);
  const authTag = buf.subarray(12, 28);
  const ct = buf.subarray(28);
  try {
    const key = await crypto.subtle.importKey("raw", Buffer.from(keyHex, "hex"), { name: "AES-GCM" }, false, ["decrypt"]);
    const dec = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, Buffer.concat([ct, authTag]));
    const parsed = JSON.parse(new TextDecoder().decode(dec));
    if (!parsed.tid || !parsed.eid || parsed.eid !== eventId) return null;
    return { ticketId: parsed.tid, eventId: parsed.eid };
  } catch {
    return null;
  }
}

async function ensureActiveTerminal() {
  const Database = require("better-sqlite3");
  const db = new Database(DB_FILE);
  const token = require("crypto").randomBytes(32).toString("hex");
  const terminalId = "term-e2e-" + Date.now();
  const future = new Date(Date.now() + 12 * 3600_000).toISOString();
  db.prepare(
    "INSERT INTO Terminal (id, eventId, name, code, status, token, tokenExpiresAt, zone, createdAt) VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, 'main', ?)"
  ).run(
    terminalId,
    EVENT_ID,
    "Test E2E",
    "T-E2E" + Date.now().toString().slice(-4),
    token,
    future,
    new Date().toISOString()
  );
  db.close();
  return { token, terminalId };
}

main().catch((e) => {
  console.error("ERREUR FATALE:", e);
  process.exit(1);
});
