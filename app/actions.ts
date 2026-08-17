"use server";

import { randomInt } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { loginWithPhone, logout as destroySession, requireUser, hashPin, createSession, roleHome } from "@/lib/auth";
import { CheckInStatus, OrderStatus, Role, TicketStatus, InvitationStatus, EventMode, TerminalStatus, DeliveryMethod, PayoutStatus } from "@/app/generated/prisma/enums";
import { parseGuestCsv, normalizePhone } from "@/lib/csv";
import { toE164 } from "@/lib/phone";
import { isRateLimited } from "@/lib/rate-limit";
import { issueOtp } from "@/lib/sms";
import { whatsappInviteLink, emailInviteLink, smsInviteLink, extractTicketCode } from "@/lib/qr";
import { decryptTicketQr, isEncryptedTicketQr } from "@/lib/ticket-crypto";
import { createOrder as shopCreateOrder, simulatePayment as shopSimulatePayment, generateSalesSlug, expireStalePendingOrders, MAX_QUANTITY, DEFAULT_EVENT_DURATION_MS, DELIVERY_FEES, clientTotal } from "@/lib/shop";
import { createTerminal, regenerateActivationCode, generateActivationCode, ACTIVATION_CODE_TTL_MS } from "@/lib/terminal";
import { publishLiveNotification, publishEventUpdate } from "@/lib/ably";
import { isRealPaymentEnabled, initiatePayment } from "@/lib/payments";
import { organizerAvailableBalance, expireStalePendingPayouts, payoutAdminThreshold } from "@/lib/payouts";
import { isFedaPayPayoutEnabled, createFedaPayPayout, startFedaPayPayouts, getFedaPayPayoutStatus } from "@/lib/fedapay";
import { isKkiapayEnabled, isKkiapaySandbox } from "@/lib/kkiapay";
import { notifyOrderPaid } from "@/lib/order-events";

// ============ HELPERS ============

async function uploadImageToStorage(file: File): Promise<string> {
  const uploadsDir = path.join(process.cwd(), "public/uploads/events");
  await fs.mkdir(uploadsDir, { recursive: true });

  const fileName = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
  const filePath = path.join(uploadsDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await fs.writeFile(filePath, buffer);

  return `/uploads/events/${fileName}`;
}

// ============ AUTH ============

export async function loginAction(formData: FormData) {
  const phone = String(formData.get("phone") || "");
  const pin = String(formData.get("pin") || "");
  const normalized = normalizePhone(phone);

  // Anti-bruteforce : 5 échecs max par numéro sur 10 min. Le PIN à 4 chiffres
  // (10 000 combinaisons) est triviale à forcer sans cette garde — le login était
  // le seul flux d'authentification sans rate limiting. Seuls les ÉCHECS comptent
  // (un utilisateur légitime qui se connecte plusieurs fois n'est jamais bloqué,
  // et un tiers ne peut pas verrouiller le compte d'autrui par des essais inconnus).
  if (normalized) {
    const failures = await prisma.rateLimitHit.count({
      where: { key: `login:${normalized}`, createdAt: { gte: new Date(Date.now() - 10 * 60_000) } },
    });
    if (failures >= 5) redirect("/login?error=2");
  }

  const user = await loginWithPhone(phone, pin);
  if (!user) {
    if (normalized) {
      await prisma.rateLimitHit.create({ data: { key: `login:${normalized}` } }).catch(() => {});
    }
    redirect("/login?error=1");
  }
  redirect(roleHome(user.role));
}

// ============ INSCRIPTION (vérification OTP) ============

export async function requestOtpAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const phone = normalizePhone(String(formData.get("phone") || ""));
  const email = String(formData.get("email") || "").trim();

  if (!name || phone.length < 8 || !email) redirect("/register?err=invalid");

  // Anti-bot : 3 demandes d'OTP max par numéro sur 10 min.
  if (await isRateLimited(`otp:${phone}`, 3, 10 * 60_000)) redirect("/register?err=rate_limited");

  const exists = await prisma.user.findUnique({ where: { phone } });
  if (exists) redirect("/register?err=phone_taken");

  // Génère, enregistre et envoie le code OTP par SMS (vérification du numéro)
  await issueOtp({ phone, name, email, purpose: "inscription" });
  redirect(
    `/register/verify?phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(name.slice(0, 120))}&email=${encodeURIComponent(email)}`
  );
}

// Termine l'inscription : vérifie l'OTP reçu par SMS puis crée le compte ORGANIZER.
export async function registerAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const phone = normalizePhone(String(formData.get("phone") || ""));
  const otp = String(formData.get("otp") || "").trim();
  const pin = String(formData.get("pin") || "");
  const confirmPin = String(formData.get("confirmPin") || "");

  const verifyParams = `phone=${encodeURIComponent(phone)}&name=${encodeURIComponent(name)}`;
  // Les erreurs de formulaire reviennent sur /register/verify (la page du
  // formulaire), pas sur /register (le formulaire d'émission du code).
  const back = (err: string): never => redirect(`/register/verify?${verifyParams}&err=${err}`);

  if (!name || phone.length < 8) redirect("/register?err=invalid");
  if (!/^\d{4}$/.test(pin)) return back("pin_format");
  if (pin !== confirmPin) return back("pin_mismatch");
  if (!/^\d{6}$/.test(otp)) return back("otp_format");

  // Anti-bot : 5 inscriptions max par numéro sur 10 min.
  if (await isRateLimited(`register:${phone}`, 5, 10 * 60_000)) redirect("/register?err=rate_limited");

  const exists = await prisma.user.findUnique({ where: { phone } });
  if (exists) redirect("/register?err=phone_taken");

  // Vérifie le dernier OTP « inscription » non consommé et non expiré (le purpose
  // empêche un OTP d'un autre flux — récupération / retrait — de valider).
  const otpRow = await prisma.otpCode.findFirst({
    where: { phone, code: otp, purpose: "inscription", consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otpRow) return back("otp_bad");
  await prisma.otpCode.update({ where: { id: otpRow.id }, data: { consumed: true } });

  const user = await prisma.user.create({
    data: {
      name,
      phone,
      pin: hashPin(pin),
      role: Role.ORGANIZER,
    },
  });
  await createSession(user.id);
  redirect("/dashboard?welcome=1");
}

// ============ RÉCUPÉRATION DU CODE PERSONNEL (OTP par SMS) ============

// Étape 1 : l'utilisateur a oublié son code personnel → on lui envoie un OTP
// par SMS (réutilise le même flux que l'inscription).
export async function requestPinResetAction(formData: FormData) {
  const phone = normalizePhone(String(formData.get("phone") || ""));
  const back = (err: string): never => redirect(`/recuperer?err=${err}&phone=${encodeURIComponent(phone)}`);
  if (phone.length < 8) return back("invalid");

  // Anti-bot : 3 demandes d'OTP max par numéro sur 10 min.
  if (await isRateLimited(`pin-reset:${phone}`, 3, 10 * 60_000)) return back("rate_limited");

  const user = await prisma.user.findUnique({ where: { phone } });
  // Compte inexistant, bloqué par l'admin, ou compte social (sans PIN) : message
  // générique ne distinguant pas ces cas (l'utilisateur n'apprend pas si le compte existe).
  if (!user || user.active === false || !user.pin) {
    return back("not_found");
  }

  // Génère, enregistre et envoie le code OTP par SMS (passerelle réelle ou dégradé).
  await issueOtp({ phone, name: user.name, purpose: "recuperation" });
  redirect(`/recuperer/verifier?phone=${encodeURIComponent(phone)}`);
}

// Étape 2 : vérifie l'OTP reçu puis remplace le code personnel.
export async function resetPinAction(formData: FormData) {
  const phone = normalizePhone(String(formData.get("phone") || ""));
  const otp = String(formData.get("otp") || "").trim();
  const pin = String(formData.get("pin") || "");
  const confirmPin = String(formData.get("confirmPin") || "");
  const verifyParams = `phone=${encodeURIComponent(phone)}`;

  if (phone.length < 8) redirect("/recuperer?err=invalid");
  if (!/^\d{4}$/.test(pin)) redirect(`/recuperer/verifier?${verifyParams}&err=pin_format`);
  if (pin !== confirmPin) redirect(`/recuperer/verifier?${verifyParams}&err=pin_mismatch`);
  if (!/^\d{6}$/.test(otp)) redirect(`/recuperer/verifier?${verifyParams}&err=otp_format`);

  // Anti-bot : 5 tentatives de réinitialisation max par numéro sur 10 min.
  if (await isRateLimited(`pin-reset-verify:${phone}`, 5, 10 * 60_000)) {
    redirect(`/recuperer/verifier?${verifyParams}&err=rate_limited`);
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || user.active === false || !user.pin) redirect("/recuperer?err=not_found");

  // Vérifie le dernier OTP « recuperation » non consommé et non expiré (le
  // purpose empêche un OTP d'un autre flux — inscription / retrait — de valider).
  const otpRow = await prisma.otpCode.findFirst({
    where: { phone, code: otp, purpose: "recuperation", consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otpRow) redirect(`/recuperer/verifier?${verifyParams}&err=otp_bad`);
  await prisma.otpCode.update({ where: { id: otpRow.id }, data: { consumed: true } });

  // Remplace le code personnel : l'utilisateur se connecte avec son nouveau code.
  await prisma.user.update({ where: { id: user.id }, data: { pin: hashPin(pin) } });
  redirect("/login?reset=1");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

// ============ PARAMÈTRES DU COMPTE (profil + sécurité) ============

// Met à jour les informations de profil : nom complet + champs enrichis selon le
// type de compte (structure / agence, email pro, responsable, téléphone pro).
export async function updateProfileAction(formData: FormData) {
  const user = await requireUser(Role.ORGANIZER);
  const name = String(formData.get("name") || "").trim().slice(0, 120);
  if (!name) redirect("/profil?profileErr=1");

  // Uniformisé : seul le nom complet est modifiable depuis le profil.
  await prisma.user.update({ where: { id: user.id }, data: { name } });
  revalidatePath("/profil");
  revalidatePath("/pro");
  redirect("/profil?updated=1");
}

// Change le code personnel : vérifie l'ancien code (bcrypt) avant de le remplacer.
export async function changePinAction(formData: FormData) {
  const user = await requireUser(Role.ORGANIZER);
  const currentPin = String(formData.get("currentPin") || "");
  const pin = String(formData.get("pin") || "");
  const confirmPin = String(formData.get("confirmPin") || "");
  const back = (err: string): never => redirect(`/profil?pinErr=${err}`);

  // Anti-bruteforce : 5 tentatives max par compte sur 10 min (comme /recuperer).
  if (await isRateLimited(`pin-change:${user.id}`, 5, 10 * 60_000)) return back("rate_limited");

  if (!/^\d{4}$/.test(currentPin)) return back("bad");
  if (!/^\d{4}$/.test(pin)) return back("format");
  if (pin !== confirmPin) return back("mismatch");
  // Compte social (connexion via Google/Facebook/Apple) : pas de code à changer.
  if (!user.pin) return back("social");
  if (pin === currentPin) return back("same");

  // Vérifie l'ancien code avant toute modification.
  if (!(await bcrypt.compare(currentPin, user.pin))) return back("bad");
  await prisma.user.update({ where: { id: user.id }, data: { pin: hashPin(pin) } });
  redirect("/profil?pinChanged=1");
}

// ============ ORGANIZER ============

// Normalise une liste de zones d'accès (accréditations) :
// ex : "main, VIP, backstage" → "main,vip,backstage" (minuscules, sans doublons).
function normalizeZones(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Nettoyage : découpage, trim, minuscules, dédoublonnage + garde-fous (max 8
  // zones, 24 caractères par zone) pour garder des noms de zones sains.
  const zones = [
    ...new Set(
      raw
        .split(",")
        .map((z) => z.trim().toLowerCase())
        .filter(Boolean)
        .map((z) => z.slice(0, 24))
    ),
  ].slice(0, 8);
  return zones.length > 0 ? zones.join(",") : null;
}

export async function createEventAction(formData: FormData) {
  const user = await requireUser(Role.ORGANIZER);
  const name = String(formData.get("name") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const dateStr = String(formData.get("date") || "");
  const endDateStr = String(formData.get("endDate") || "");
  const capacity = parseInt(String(formData.get("capacity") || "0"), 10);
  const type = String(formData.get("type") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;
  const imageUrl = String(formData.get("imageUrl") || "").trim() || null;
  const doorsOpen = String(formData.get("doorsOpen") || "").trim() || null;
  const contactName = String(formData.get("contactName") || "").trim() || null;
  const contactPhone = String(formData.get("contactPhone") || "").trim() || null;
  const salesAtDoor = formData.get("salesAtDoor") === "1";
  const maxPerCustomer = Math.max(1, Math.min(MAX_QUANTITY, parseInt(String(formData.get("maxPerCustomer") || "10"), 10) || 10));
  const status = formData.get("status") === "DRAFT" ? "DRAFT" : "LIVE";
  // Mode d'accès : PUBLIC (billetterie) / INVITE (invitations privées) / COMBINED.
  const modeRaw = String(formData.get("mode") || "PUBLIC");
  const mode = modeRaw === EventMode.INVITE || modeRaw === EventMode.COMBINED ? modeRaw : EventMode.PUBLIC;
  // Zones d'accès de l'événement (accréditations), ex : "main, vip, backstage".
  const zones = normalizeZones(String(formData.get("zones") || ""));

  if (!name || !location || !dateStr || !capacity) return;

  const event = await prisma.event.create({
    data: {
      organizerId: user.id,
      name,
      location,
      type,
      description,
      imageUrl,
      doorsOpen,
      contactName,
      contactPhone,
      salesAtDoor,
      maxPerCustomer,
      mode,
      zones,
      date: new Date(dateStr),
      ...(endDateStr ? { endDate: new Date(endDateStr) } : {}),
      capacity,
      status,
    },
  });

  // Slug de vente : lien public /acheter/<slug> généré à la création.
  const salesSlug = await generateSalesSlug(event.id, name);
  await prisma.event.update({ where: { id: event.id }, data: { salesSlug } });

  // Catégories de billets : lignes dynamiques (nom / prix FCFA / places / zones).
  // Les catégories avec zones = accréditations (ex : Staff — backstage) : le
  // scanner refuse l'entrée aux portes dont la zone n'est pas autorisée (WRONG_ZONE).
  const catNames = formData.getAll("catName").map((v) => String(v).trim());
  const catPrices = formData.getAll("catPrice").map((v) => parseInt(String(v), 10) || 0);
  const catCapacities = formData.getAll("catCapacity").map((v) => parseInt(String(v), 10) || 0);
  const catZones = formData.getAll("catZones").map((v) => normalizeZones(String(v)));

  const cats = catNames.map((catName, i) => ({
    catName,
    catPrice: catPrices[i] ?? 0,
    catCapacity: catCapacities[i] ?? 0,
    catZones: catZones[i] ?? null,
  }));
  const validCats = cats.filter((c) => c.catName);

  if (validCats.length === 0) {
    // Aucune catégorie renseignée → catégorie par défaut gratuite.
    await prisma.ticketCategory.create({ data: { eventId: event.id, name: "Standard", capacity, price: 0 } });
  } else {
    for (const c of validCats) {
      await prisma.ticketCategory.create({
        data: {
          eventId: event.id,
          name: c.catName,
          capacity: c.catCapacity > 0 ? c.catCapacity : capacity,
          price: c.catPrice,
          ...(c.catZones ? { zones: c.catZones } : {}),
        },
      });
    }
  }

  revalidatePath("/dashboard");
  redirect(`/events/${event.id}?${status === "DRAFT" ? "draft=1" : "sales=1"}`);
}

// Vérifie que l'événement appartient à l'organisateur connecté.
async function requireOwnedEvent(eventId: string, organizerId: string) {
  const event = await prisma.event.findFirst({ where: { id: eventId, organizerId } });
  if (!event) throw new Error("Événement introuvable ou non autorisé.");
  return event;
}

export async function addGuestAction(formData: FormData) {
  const user = await requireUser(Role.ORGANIZER);
  const eventId = String(formData.get("eventId") || "");
  const guestName = String(formData.get("guestName") || "").trim();
  // Normalisation identique à l'import CSV : +229 / 00229 / espaces retirés → doublons détectés.
  const guestPhone = normalizePhone(String(formData.get("guestPhone") || "")) || null;
  const guestEmail = String(formData.get("guestEmail") || "").trim() || null;
  const categoryId = String(formData.get("categoryId") || "") || null;
  // Le « +1 » : 1 personne par défaut, 2 = l'invité + 1 accompagnant (max 10 par invitation).
  const guestCount = Math.max(1, Math.min(10, parseInt(String(formData.get("guestCount") || "1"), 10) || 1));

  if (!guestName) return;
  await requireOwnedEvent(eventId, user.id);

  // Anti-doublon (cohérent avec l'import CSV) : même téléphone déjà invité → refus.
  if (guestPhone) {
    const dup = await prisma.ticket.findFirst({
      where: { eventId, guestPhone },
    });
    if (dup) redirect(`/events/${eventId}?dupGuest=1`);
  }

  // Généré immédiatement : code + QR existent dès l'ajout (cycle : CRÉÉ → GÉNÉRÉ).
  await prisma.ticket.create({
    data: {
      eventId,
      categoryId: categoryId || undefined,
      // Code en MAJUSCULES : toutes les recherches (page /t/, scanner) normalisent
      // l'entrée en majuscules — les codes stockés doivent l'être aussi.
      code: crypto.randomUUID().replace(/-/g, "").toUpperCase(),
      guestName,
      guestPhone,
      guestEmail,
      guestCount,
      inviteStatus: InvitationStatus.GENERATED,
    },
  });
  revalidatePath(`/events/${eventId}`);
}

// ============ IMPORT CSV DES INVITÉS ============

const CSV_MAX_FILE_SIZE = 2_000_000; // 2 Mo

export async function importGuestsAction(formData: FormData) {
  const user = await requireUser(Role.ORGANIZER);
  const eventId = String(formData.get("eventId") || "");
  if (!eventId) redirect("/dashboard");
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    redirect(`/events/${eventId}?importErr=1`);
  }
  if (file.size > CSV_MAX_FILE_SIZE) redirect(`/events/${eventId}?importErr=2`);

  await requireOwnedEvent(eventId, user.id);
  const { rows, error } = parseGuestCsv(await file.text());
  if (error === "TOO_LARGE") redirect(`/events/${eventId}?importErr=2`);
  if (error === "EMPTY" || rows.length === 0) redirect(`/events/${eventId}?importErr=1`);

  // Catégories de l'événement (correspondance par nom, insensible à la casse)
  const categories = await prisma.ticketCategory.findMany({ where: { eventId } });
  const defaultCategory = categories[0] ?? null;
  const categoryByName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));

  // Évite les doublons (même téléphone déjà invité)
  const existingPhones = new Set(
    (
      await prisma.ticket.findMany({
        where: { eventId, guestPhone: { not: null } },
        select: { guestPhone: true },
      })
    ).map((t) => t.guestPhone)
  );

  const toCreate: Array<{ eventId: string; categoryId?: string; code: string; guestName: string; guestPhone?: string; guestEmail?: string; guestCount: number; inviteStatus: InvitationStatus }> = [];
  for (const row of rows) {
    if (row.phone && existingPhones.has(row.phone)) continue;
    if (row.phone) existingPhones.add(row.phone);

    const categoryId = row.categoryName ? categoryByName.get(row.categoryName.toLowerCase()) : undefined;
    toCreate.push({
      eventId,
      ...(categoryId ? { categoryId } : defaultCategory ? { categoryId: defaultCategory.id } : {}),
      code: crypto.randomUUID().replace(/-/g, "").toUpperCase(),
      guestName: row.name,
      ...(row.phone ? { guestPhone: row.phone } : {}),
      ...(row.email ? { guestEmail: row.email } : {}),
      guestCount: row.people > 0 ? Math.min(10, row.people) : 1,
      // Comme l'ajout manuel : le QR existe dès l'import (cycle CRÉÉ → GÉNÉRÉ).
      inviteStatus: InvitationStatus.GENERATED,
    });
  }

  // Insertion par lots (limite des paramètres SQLite)
  for (let i = 0; i < toCreate.length; i += 100) {
    await prisma.ticket.createMany({ data: toCreate.slice(i, i + 100) });
  }

  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?imported=${toCreate.length}`);
}

// ============ GESTION DES INVITATIONS (cycle de vie) ============

// Envoi groupé simulé : marque les invitations sélectionnées ENVOYÉES et renvoie
// les liens à ouvrir (wa.me / mailto pré-remplis).
export async function sendInvitationsAction(
  eventId: string,
  ticketIds: string[],
  channel: "WHATSAPP" | "EMAIL" | "SMS"
): Promise<{ sent: number; links: Array<{ url: string; guestName: string }> }> {
  const user = await requireUser(Role.ORGANIZER);
  await requireOwnedEvent(eventId, user.id);

  const ids = [...new Set(ticketIds)].slice(0, 200);
  if (ids.length === 0) return { sent: 0, links: [] };

  const tickets = await prisma.ticket.findMany({
    where: { id: { in: ids }, eventId },
  });
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { sent: 0, links: [] };

  const links: Array<{ url: string; guestName: string }> = [];
  const sentIds: string[] = [];
  for (const t of tickets) {
    if (t.inviteStatus === InvitationStatus.ENTERED || t.inviteStatus === InvitationStatus.CANCELLED) continue;
    const url =
      channel === "WHATSAPP"
        ? whatsappInviteLink(t.guestPhone, event.name, t.guestName, t.code, t.guestCount)
        : channel === "SMS"
          ? smsInviteLink(t.guestPhone, event.name, t.guestName, t.code, t.guestCount)
          : emailInviteLink(t.guestEmail, event.name, t.guestName, t.code, t.guestCount);
    // Un canal de contact réel (téléphone / email) est requis : sans lui, rien n'est envoyé.
    if (url) {
      links.push({ url, guestName: t.guestName });
      sentIds.push(t.id);
    }
  }

  // Marque ENVOYÉ uniquement les invitations avec un canal de contact.
  if (sentIds.length > 0) {
    await prisma.ticket.updateMany({
      where: { id: { in: sentIds } },
      data: { inviteStatus: InvitationStatus.SENT },
    });
  }
  revalidatePath(`/events/${eventId}`);
  return { sent: links.length, links };
}

// Modifie une invitation : email, nombre de personnes autorisées (+1).
export async function updateGuestAction(formData: FormData) {
  const user = await requireUser(Role.ORGANIZER);
  const eventId = String(formData.get("eventId") || "");
  const ticketId = String(formData.get("ticketId") || "");
  const guestEmail = String(formData.get("guestEmail") || "").trim() || null;
  const guestCount = Math.max(1, Math.min(10, parseInt(String(formData.get("guestCount") || "1"), 10) || 1));
  if (!ticketId) return;
  await requireOwnedEvent(eventId, user.id);
  await prisma.ticket.updateMany({
    where: { id: ticketId, eventId },
    data: { guestEmail, guestCount },
  });
  revalidatePath(`/events/${eventId}`);
}

// Change le statut d'une invitation : ANNULER / CONFIRMER / (re)GÉNÉRER.
export async function setInviteStatusAction(ticketId: string, eventId: string, status: InvitationStatus) {
  const user = await requireUser(Role.ORGANIZER);
  await requireOwnedEvent(eventId, user.id);
  await prisma.ticket.updateMany({
    where: { id: ticketId, eventId },
    data: { inviteStatus: status },
  });
  revalidatePath(`/events/${eventId}`);
}

// ============ VALIDITÉ TEMPORELLE + RATE LIMITING ============

const EARLY_LEEWAY_MS = 2 * 3600_000; // 2 h d'avance tolérées avant le début

// Règle anti-fraude #3 : un billet n'est accepté que pendant [début − 2h, fin].
function temporalStatus(event: { date: Date; endDate: Date | null }, at: Date): CheckInStatus | null {
  const end = event.endDate ?? new Date(event.date.getTime() + DEFAULT_EVENT_DURATION_MS);
  if (at < new Date(event.date.getTime() - EARLY_LEEWAY_MS)) return CheckInStatus.TOO_EARLY;
  if (at > end) return CheckInStatus.EXPIRED;
  return null;
}

export type ScanGeo = { lat?: number | null; lng?: number | null };

// ============ ALERTES DE JAUGE (80 / 90 / 100 %) ============

async function maybeTriggerCapacityAlerts(eventId: string, capacity: number) {
  const entered = await prisma.checkIn.count({
    where: { eventId, status: { in: [CheckInStatus.VALID, CheckInStatus.ENTRY] } },
  });
  const pct = capacity > 0 ? Math.floor((entered / capacity) * 100) : 0;
  const triggered: number[] = [];
  for (const threshold of [80, 90, 100]) {
    if (pct >= threshold) {
      await prisma.capacityAlert
        .upsert({
          where: { eventId_threshold: { eventId, threshold } },
          update: {},
          create: { eventId, threshold },
        })
        .catch(() => {});
      triggered.push(threshold);
    }
  }
  // Temps réel : avertit l'organisateur quand un palier de jauge est franchi.
  if (triggered.length > 0) {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { organizerId: true, name: true, capacity: true },
    });
    if (event) {
      const threshold = Math.max(...triggered);
      void publishLiveNotification(event.organizerId, {
        kind: "gauge",
        title: `${event.name} a atteint ${threshold} % de sa capacité`,
        desc: `${entered} entrée${entered > 1 ? "s" : ""} sur ${event.capacity} — jauge ${pct} %.`,
        href: `/events/${eventId}`,
      });
      void publishEventUpdate(eventId, { pct, entered, capacity: event.capacity, threshold });
    }
  }
}

// ============ CHECK-IN (cœur anti-fraude) ============

export type CheckInResult = {
  status: CheckInStatus;
  guestName?: string;
  category?: string;
  message: string;
  // Invitation multi-personnes : progression des entrées (ex : 2/4).
  entriesCount?: number;
  guestCount?: number;
};

// Contexte d'un scan : agent, terminal optionnel (SIGMA Scanner), zone de la porte.
type CheckInContext = {
  agentId: string;
  geo?: ScanGeo;
  source?: string;
  syncId?: string;
  scannedAt?: Date;
  terminalId?: string;
  zone?: string | null;
};

// Cœur de validation d'un scan — partagé entre l'app web (/scan), les terminaux
// SIGMA Scanner (temps réel) et la synchronisation hors-ligne.
// Résout le billet à partir d'une entrée scannée : QR CHIFFRÉ (blob
// `S1{eventId}:…` AES-256-GCM) → déchiffrement + recherche par id ; code en
// clair saisi à la main → recherche par code. Retourne le `where` Prisma, ou
// null si le blob est falsifié / illisible (→ INVALID).
function ticketWhereFromScan(raw: string): { id: string } | { code: string } | null {
  if (isEncryptedTicketQr(raw)) {
    try {
      return { id: decryptTicketQr(raw).ticketId };
    } catch {
      return null;
    }
  }
  return { code: extractTicketCode(raw).toUpperCase() };
}

async function runCheckInCore(eventId: string, code: string, ctx: CheckInContext): Promise<CheckInResult> {
  const at = ctx.scannedAt ?? new Date();
  const logOptions = {
    source: ctx.source,
    syncId: ctx.syncId,
    scannedAt: at,
    revalidate: true,
    geo: ctx.geo,
    terminalId: ctx.terminalId,
  };

  // 0. Fonction urgence : les entrées sont suspendues par l'organisateur.
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { status: CheckInStatus.INVALID, message: "Événement introuvable." };
  if (event.entranceBlocked) {
    await logCheckIn(eventId, null, ctx.agentId, CheckInStatus.SUSPENDED, logOptions);
    return {
      status: CheckInStatus.SUSPENDED,
      message: "Entrées temporairement suspendues par l'organisateur. Veuillez attendre les instructions.",
    };
  }

  // 1. Billet introuvable → INVALID
  // Résolution du billet : QR CHIFFRÉ (blob S1{eventId}:…, AES-256-GCM) →
  // déchiffrement + recherche par id ; code en clair saisi à la main → par code.
  const ticketWhere = ticketWhereFromScan(code);
  if (!ticketWhere) {
    await logCheckIn(eventId, null, ctx.agentId, CheckInStatus.INVALID, logOptions);
    return { status: CheckInStatus.INVALID, message: "Billet inconnu ou falsifié." };
  }
  const ticket = await prisma.ticket.findUnique({
    where: ticketWhere,
    include: { event: true, category: true },
  });
  if (!ticket) {
    await logCheckIn(eventId, null, ctx.agentId, CheckInStatus.INVALID, logOptions);
    return { status: CheckInStatus.INVALID, message: "Billet inconnu ou falsifié." };
  }
  if (ticket.eventId !== eventId) {
    await logCheckIn(eventId, ticket.id, ctx.agentId, CheckInStatus.INVALID, logOptions);
    return { status: CheckInStatus.INVALID, message: "Ce billet n'est pas pour cet événement." };
  }

  // 1bis. Droits d'accès par zone (accréditations) : la porte du terminal n'est
  //       pas autorisée pour ce type de billet → refus (mauvaise porte).
  if (ctx.zone && ticket.category?.zones) {
    const allowed = ticket.category.zones.split(",").map((z) => z.trim().toLowerCase());
    if (!allowed.includes(ctx.zone.toLowerCase())) {
      await logCheckIn(eventId, ticket.id, ctx.agentId, CheckInStatus.WRONG_ZONE, logOptions);
      return {
        status: CheckInStatus.WRONG_ZONE,
        guestName: ticket.guestName,
        category: ticket.category?.name,
        message: "Ce billet n'est pas autorisé pour cette porte / zone d'accès.",
      };
    }
  }

  // 2. Liste noire → BLACKLISTED
  if (ticket.status === TicketStatus.BLACKLISTED) {
    await logCheckIn(eventId, ticket.id, ctx.agentId, CheckInStatus.BLACKLISTED, logOptions);
    return {
      status: CheckInStatus.BLACKLISTED,
      guestName: ticket.guestName,
      message: `Billet en liste noire${ticket.blacklistReason ? " : " + ticket.blacklistReason : ""}.`,
    };
  }

  // 3. Validité temporelle : [début − 2h, fin] (anti-fraude)
  const temporal = temporalStatus(ticket.event, at);
  if (temporal === CheckInStatus.TOO_EARLY) {
    await logCheckIn(eventId, ticket.id, ctx.agentId, CheckInStatus.TOO_EARLY, logOptions);
    return {
      status: CheckInStatus.TOO_EARLY,
      guestName: ticket.guestName,
      message: `L'événement commence à ${ticket.event.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}. Revenez dans la plage d'ouverture.`,
    };
  }
  if (temporal === CheckInStatus.EXPIRED) {
    await logCheckIn(eventId, ticket.id, ctx.agentId, CheckInStatus.EXPIRED, logOptions);
    return {
      status: CheckInStatus.EXPIRED,
      guestName: ticket.guestName,
      message: "L'événement est terminé.",
    };
  }

  // 4. Capacité maximale atteinte → FULL (chaque personne entrée compte une place)
  const entered = await prisma.checkIn.count({
    where: { eventId, status: { in: [CheckInStatus.VALID, CheckInStatus.ENTRY] } },
  });
  if (entered >= ticket.event.capacity) {
    await logCheckIn(eventId, ticket.id, ctx.agentId, CheckInStatus.FULL, logOptions);
    return {
      status: CheckInStatus.FULL,
      guestName: ticket.guestName,
      message: "Capacité maximale atteinte.",
    };
  }

  // 5. Invitation entièrement consommée → ALREADY_SCANNED
  const guestCount = Math.max(1, ticket.guestCount || 1);
  if (ticket.status === TicketStatus.ENTERED || ticket.entriesCount >= guestCount) {
    const previous = await prisma.checkIn.findFirst({
      where: { ticketId: ticket.id, status: { in: [CheckInStatus.VALID, CheckInStatus.ENTRY] } },
      orderBy: { scannedAt: "desc" },
    });
    await logCheckIn(eventId, ticket.id, ctx.agentId, CheckInStatus.ALREADY_SCANNED, logOptions);
    return {
      status: CheckInStatus.ALREADY_SCANNED,
      guestName: ticket.guestName,
      entriesCount: guestCount,
      guestCount,
      message:
        guestCount > 1
          ? `Invitation déjà consommée (${guestCount}/${guestCount} entrées).`
          : `Déjà scanné à ${previous?.scannedAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) || "?"}.`,
    };
  }

  // 6. Entrée autorisée : une personne de plus entre.
  //    - Invitation simple (1 personne) → VALID + ticket ENTERED (inchangé).
  //    - Invitation multi-personnes (+1) → ENTRY tant qu'il reste des entrées,
  //      VALID + ticket ENTERED à la dernière entrée.
  const nextCount = ticket.entriesCount + 1;
  const complete = nextCount >= guestCount;
  await prisma.$transaction([
    prisma.ticket.update({
      where: { id: ticket.id },
      data: {
        entriesCount: nextCount,
        status: complete ? TicketStatus.ENTERED : TicketStatus.ISSUED,
        inviteStatus: complete ? InvitationStatus.ENTERED : ticket.inviteStatus,
      },
    }),
    prisma.checkIn.create({
      data: {
        ticketId: ticket.id,
        eventId,
        agentId: ctx.agentId,
        ...(ctx.terminalId ? { terminalId: ctx.terminalId } : {}),
        status: complete ? CheckInStatus.VALID : CheckInStatus.ENTRY,
        source: ctx.source ?? "ONLINE",
        ...(ctx.syncId ? { syncId: ctx.syncId } : {}),
        ...(at ? { scannedAt: at } : {}),
        ...(ctx.geo?.lat != null ? { lat: ctx.geo.lat } : {}),
        ...(ctx.geo?.lng != null ? { lng: ctx.geo.lng } : {}),
      },
    }),
  ]);
  await maybeTriggerCapacityAlerts(eventId, ticket.event.capacity);
  revalidatePath(`/events/${eventId}`);
  // Temps réel : informe l'organisateur d'une entrée validée (scan agent).
  void publishLiveNotification(ticket.event.organizerId, {
    kind: "checkin",
    title: `Entrée : ${ticket.guestName}`,
    desc: `${ticket.event.name} — ${ticket.category?.name ?? "Billet"} (${nextCount}/${guestCount})`,
    href: `/events/${eventId}`,
  });
  return {
    status: complete ? CheckInStatus.VALID : CheckInStatus.ENTRY,
    guestName: ticket.guestName,
    category: ticket.category?.name,
    entriesCount: nextCount,
    guestCount,
    message: complete
      ? guestCount > 1
        ? `Entrée autorisée — ${guestCount}/${guestCount} entrées consommées.`
        : "Entrée autorisée."
      : `Entrée autorisée — ${nextCount}/${guestCount} entrées (il en reste ${guestCount - nextCount}).`,
  };
}

// Scan par un agent connecté (app web /scan/[eventId]).
export async function checkInAction(
  eventId: string,
  code: string,
  geo?: ScanGeo
): Promise<CheckInResult> {
  // 🔒 Autorisation : seul un agent assigné à l'événement peut scanner.
  const user = await requireUser(Role.AGENT);
  const assignment = await prisma.eventAgent.findUnique({
    where: { eventId_agentId: { eventId, agentId: user.id } },
  });
  if (!assignment) {
    return { status: CheckInStatus.INVALID, message: "Agent non assigné à cet événement." };
  }

  // Anti-bot : 60 scans max par agent et par événement sur 10 s.
  if (await isRateLimited(`checkin:${user.id}:${eventId}`, 60, 10_000)) {
    return { status: CheckInStatus.INVALID, message: "Trop de requêtes. Réessayez dans un instant." };
  }

  return runCheckInCore(eventId, code, { agentId: user.id, geo });
}

// Scan temps réel depuis un terminal SIGMA Scanner (agent + terminal + porte).
// Le terminal est identifié par son token API (Bearer) et doit être ACTIVE.
export async function terminalCheckInAction(
  terminalId: string,
  code: string,
  geo?: ScanGeo
): Promise<CheckInResult> {
  const terminal = await prisma.terminal.findUnique({
    where: { id: terminalId },
    include: { event: true, agent: true },
  });
  if (!terminal || terminal.status !== TerminalStatus.ACTIVE) {
    return { status: CheckInStatus.INVALID, message: "Terminal inactif, désactivé ou révoqué." };
  }
  if (!terminal.agentId) {
    return { status: CheckInStatus.INVALID, message: "Aucun agent associé à ce terminal." };
  }

  // Anti-bot : 60 scans max par terminal sur 10 s.
  if (await isRateLimited(`terminal-checkin:${terminalId}`, 60, 10_000)) {
    return { status: CheckInStatus.INVALID, message: "Trop de requêtes. Réessayez dans un instant." };
  }

  const result = await runCheckInCore(terminal.eventId, code, {
    agentId: terminal.agentId,
    terminalId: terminal.id,
    zone: terminal.zone,
    source: "TERMINAL",
    geo,
  });

  // Activité en direct : dernière activité du terminal (dashboard organisateur).
  await prisma.terminal
    .update({
      where: { id: terminal.id },
      data: {
        lastSeenAt: new Date(),
        lastScanAt: new Date(),
        scansCount: { increment: 1 },
      },
    })
    .catch(() => {});
  return result;
}

// Reçoit la liste des billets d'un événement à télécharger sur un terminal
// (bootstrap offline-first) : uniquement les données nécessaires au contrôle.
export async function bootstrapTerminalAction(terminalId: string) {
  const terminal = await prisma.terminal.findUnique({
    where: { id: terminalId },
    include: {
      event: {
        include: { categories: { select: { id: true, name: true, zones: true } } },
      },
      agent: { select: { id: true, name: true } },
    },
  });
  if (!terminal || terminal.status !== TerminalStatus.ACTIVE) return null;

  const tickets = await prisma.ticket.findMany({
    where: { eventId: terminal.eventId },
    select: {
      id: true, // nécessaire à la vérification hors-ligne (le QR chiffré encode l'id)
      code: true,
      guestName: true,
      guestCount: true,
      entriesCount: true,
      status: true,
      blacklistReason: true,
      inviteStatus: true,
      category: { select: { id: true, name: true, zones: true } },
    },
  });

  // Un terminal ACTIVE est toujours associé à un agent (obligatoire à l'activation).
  const agent = terminal.agent ?? null;

  return {
    terminal: { id: terminal.id, code: terminal.code, name: terminal.name, zone: terminal.zone },
    event: {
      id: terminal.event.id,
      name: terminal.event.name,
      location: terminal.event.location,
      date: terminal.event.date.toISOString(),
      endDate: terminal.event.endDate?.toISOString() ?? null,
      capacity: terminal.event.capacity,
      entranceBlocked: terminal.event.entranceBlocked,
    },
    agent: agent ? { id: agent.id, name: agent.name } : null,
    categories: terminal.event.categories,
    tickets: tickets.map((t) => ({
      id: t.id, // id serveur — le QR chiffré encode cet id (déchiffrement hors-ligne)
      code: t.code,
      guestName: t.guestName,
      guestCount: t.guestCount,
      entriesCount: t.entriesCount,
      status: t.status,
      blacklistReason: t.blacklistReason,
      inviteStatus: t.inviteStatus,
      category: t.category,
    })),
  };
}

async function logCheckIn(
  eventId: string,
  ticketId: string | null,
  agentId: string,
  status: CheckInStatus,
  options?: { source?: string; syncId?: string; scannedAt?: Date; revalidate?: boolean; geo?: ScanGeo; terminalId?: string }
) {
  await prisma.checkIn.create({
    data: {
      eventId,
      status,
      ...(ticketId ? { ticketId } : {}),
      agentId,
      ...(options?.terminalId ? { terminalId: options.terminalId } : {}),
      source: options?.source ?? "ONLINE",
      ...(options?.syncId ? { syncId: options.syncId } : {}),
      ...(options?.scannedAt ? { scannedAt: options.scannedAt } : {}),
      ...(options?.geo?.lat != null ? { lat: options.geo.lat } : {}),
      ...(options?.geo?.lng != null ? { lng: options.geo.lng } : {}),
    },
  });
  if (options?.revalidate ?? true) revalidatePath(`/events/${eventId}`);
}

// ============ BILLETTERIE EN LIGNE (public) ============

// Le client remplit le formulaire sur /acheter/<slug> → commande PENDING.
export async function createOrderAction(formData: FormData) {
  // Libère les places des commandes abandonnées avant tout contrôle de capacité.
  await expireStalePendingOrders();

  const eventId = String(formData.get("eventId") || "");
  const categoryId = String(formData.get("categoryId") || "");
  const customerName = String(formData.get("customerName") || "");
  const customerPhone = String(formData.get("customerPhone") || "");
  const customerEmail = String(formData.get("customerEmail") || "") || null;
  const quantity = Math.max(1, Math.min(MAX_QUANTITY, parseInt(String(formData.get("quantity") || "1"), 10) || 1));

  // Anti-bot : 5 commandes max par téléphone et par événement sur 10 min.
  const key = `shop:${customerPhone.replace(/\s/g, "")}:${eventId}`;
  if (await isRateLimited(key, 5, 10 * 60_000)) {
    const slug = (await prisma.event.findUnique({ where: { id: eventId } }))?.salesSlug;
    if (slug) redirect(`/acheter/${slug}?err=RATE_LIMITED`);
    redirect("/");
  }

  const result = await shopCreateOrder({ eventId, categoryId, customerName, customerPhone, customerEmail, quantity });
  if (!result.ok) {
    const slug = (await prisma.event.findUnique({ where: { id: eventId } }))?.salesSlug;
    if (slug) redirect(`/acheter/${slug}?err=${result.error}`);
    redirect("/");
  }

  // Billet gratuit (0 FCFA) : pas de page de paiement — le billet est émis immédiatement.
  if (result.amount === 0) {
    const free = await shopSimulatePayment(result.orderId, "FREE");
    const slug = (await prisma.event.findUnique({ where: { id: eventId } }))?.salesSlug;
    if (!free.ok) {
      if (slug) redirect(`/acheter/${slug}?err=${free.error}`);
      redirect("/");
    }
    redirect(`/acheter/confirmation/${result.orderId}`);
  }
  redirect(`/acheter/payer/${result.orderId}`);
}

// Valide le paiement mobile money → billet émis.
// - Mode réel (DODO_API_KEY configurée) : initie le paiement chez Dodo et
//   redirige le client vers son checkout (confirmation par webhook ensuite).
// - Mode démo (par défaut) : simulation immédiate, aucun débit réel.
// Le réseau choisi (MTN_MOMO, MOOV_MONEY…) est transmis via le formulaire.
export async function simulatePaymentAction(formData: FormData) {
  const orderId = String(formData.get("orderId") || "");
  const network = String(formData.get("network") || "") || undefined;
  // Mode de livraison choisi avant paiement (téléchargement / email / WhatsApp).
  const delivery = String(formData.get("delivery") || "") || undefined;
  // Anti-bot : 10 validations max sur la même commande en 10 s.
  if (await isRateLimited(`shop-pay:${orderId}`, 10, 10_000)) redirect("/");
  // La commande a expiré pendant que le client remplissait le formulaire de paiement.
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { event: true, category: true },
  });
  if (order && order.status === OrderStatus.CANCELLED) {
    const slug = order.event.salesSlug;
    if (slug) redirect(`/acheter/${slug}?err=EXPIRED`);
    redirect("/");
  }

  // Méthode de livraison validée : DOWNLOAD | EMAIL | WHATSAPP (sinon téléchargement gratuit).
  const safeDelivery =
    delivery === DeliveryMethod.EMAIL || delivery === DeliveryMethod.WHATSAPP || delivery === DeliveryMethod.DOWNLOAD
      ? (delivery as DeliveryMethod)
      : undefined;

  // --- Passerelle réelle (Dodo Payments) ---
  if (order && isRealPaymentEnabled() && order.status === OrderStatus.PENDING) {
    try {
      // La livraison choisie est enregistrée AVANT l'initiation : le montant
      // facturé inclut le frais de livraison, et le webhook la retrouvera pour
      // déclencher l'envoi (email / WhatsApp) après confirmation.
      await prisma.order.update({
        where: { id: order.id },
        data: safeDelivery
          ? { deliveryMethod: safeDelivery, deliveryFee: DELIVERY_FEES[safeDelivery] }
          : {},
      });
      const fresh = await prisma.order.findUnique({ where: { id: order.id } });
      const init = await initiatePayment({
        orderId: order.id,
        reference: order.reference,
        // Prix tout compris (billets + livraison) avec gross-up FedaPay : c'est
        // le montant réellement débité au client, vérifié ensuite par le webhook.
        amount: clientTotal(fresh ?? order),
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        eventName: order.event.name,
      });
      if (init.mode === "dodo") {
        // Stocke l'identifiant de paiement externe : le webhook s'en sert pour
        // retrouver la commande et confirmer (émission des billets).
        await prisma.order.update({
          where: { id: order.id },
          data: {
            externalPaymentId: init.paymentId,
            externalProvider: "dodo",
            externalStatus: "pending",
          },
        });
        // Le client règle sur le checkout Dodo (MTN MoMo / Moov Money / Celtiis Cash).
        redirect(init.redirectUrl);
      }
    } catch (e) {
      // Passerelle configurée mais en échec (clé invalide, produit inexistant…) :
      // on NE simule PAS en production — un paiement simulé donnerait un billet
      // gratuit. Si une autre passerelle est configurée (KKIAPAY), on bascule
      // dessus ; sinon on renvoie vers la page de paiement avec une erreur.
      console.error("[payments] initiation Dodo échouée", e);
      if (isKkiapayEnabled()) {
        redirect(`/acheter/payer/${order.id}?kkiapay=1`);
      }
      redirect(`/acheter/payer/${order.id}?err=PAYMENT_UNAVAILABLE`);
    }
  }

  // --- Passerelle réelle (KKIAPAY) ---
  // La livraison est enregistrée AVANT l'ouverture du widget (le montant facturé
  // inclut le frais de livraison), puis on redirige vers la page de paiement en
  // mode widget : le client paie dans openKkiapayWidget, KKIAPAY redirige vers
  // la confirmation, et le webhook /api/webhook/kkiapay confirme la commande.
  if (order && isKkiapayEnabled() && order.status === OrderStatus.PENDING) {
    await prisma.order.update({
      where: { id: order.id },
      data: safeDelivery
        ? { deliveryMethod: safeDelivery, deliveryFee: DELIVERY_FEES[safeDelivery] }
        : {},
    });
    redirect(`/acheter/payer/${order.id}?kkiapay=1`);
  }

  // --- Mode démo (simulation) ---
  const result = await shopSimulatePayment(orderId, network, delivery);
  if (!result.ok) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    const slug = order ? (await prisma.event.findUnique({ where: { id: order.eventId } }))?.salesSlug : null;
    if (slug) redirect(`/acheter/${slug}?err=${result.error}`);
    redirect("/");
  }

  // Temps réel + file d'emails : paiement validé → notification à l'organisateur,
  // facture + billet mis en file d'attente (CloudAMQP, worker scripts/email-worker.ts).
  await notifyOrderPaid(orderId);
  revalidatePath(`/acheter/confirmation/${orderId}`);
  redirect(`/acheter/confirmation/${orderId}`);
}

// ============ FINALISATION DE SECOURS (PHASE DE TEST UNIQUEMENT) ============

// Pendant la phase de test (sandbox KKIA), si la passerelle externe ne répond
// pas (webhook non reçu, widget bloqué…), l'organisateur ou le client peut
// finaliser la commande en mode simulé pour ne pas rester bloqué : le billet
// est émis normalement, sans débit réel. ⚠️ À RETIRER au passage en production
// (garde-fou : l'action n'existe que quand KKIA tourne en sandbox).
export async function finalizeOrderTestAction(formData: FormData) {
  const orderId = String(formData.get("orderId") || "");
  const delivery = String(formData.get("delivery") || "") || undefined;

  // Garde-fou : jamais disponible hors mode test (clés sandbox).
  if (!isKkiapaySandbox()) redirect("/");

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.status !== OrderStatus.PENDING) {
    redirect(order ? `/acheter/confirmation/${order.id}` : "/");
  }

  const result = await shopSimulatePayment(orderId, "MTN_MOMO", delivery);
  if (!result.ok) {
    const slug = (await prisma.event.findUnique({ where: { id: order.eventId } }))?.salesSlug;
    if (slug) redirect(`/acheter/${slug}?err=${result.error}`);
    redirect("/");
  }

  await notifyOrderPaid(orderId);
  revalidatePath(`/acheter/confirmation/${orderId}`);
  redirect(`/acheter/confirmation/${orderId}`);
}

// Change le cycle de vie d'un événement : DRAFT (brouillon, boutique non visible) /
// LIVE (annoncé, boutique ouverte) / DONE (terminé, ventes fermées).
export async function toggleEventStatusAction(eventId: string, status: "DRAFT" | "LIVE" | "DONE") {
  const user = await requireUser(Role.ORGANIZER);
  await requireOwnedEvent(eventId, user.id);
  await prisma.event.update({ where: { id: eventId }, data: { status } });
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/acheter/${(await prisma.event.findUnique({ where: { id: eventId } }))?.salesSlug ?? ""}`);
}

// ============ SUPER ADMIN : plateforme ============

// Bloque / débloque un compte (organisateur ou agent). Les sessions actives sont
// détruites : l'utilisateur est déconnecté immédiatement.
export async function toggleUserActiveAction(userId: string) {
  const admin = await requireUser(Role.SUPER_ADMIN);
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role === Role.SUPER_ADMIN) return; // on ne bloque pas un admin
  if (target.id === admin.id) return;
  const next = !target.active;
  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { active: next } }),
    ...(next ? [] : [prisma.session.deleteMany({ where: { userId: target.id } })]),
  ]);
  revalidatePath("/admin/organisateurs");
}

// Modifie le taux de commission Sigma (%) d'un organisateur.
export async function updateCommissionAction(formData: FormData) {
  await requireUser(Role.SUPER_ADMIN);
  const userId = String(formData.get("userId") || "");
  const rate = parseInt(String(formData.get("rate") || "0"), 10);
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role !== Role.ORGANIZER) return;
  await prisma.user.update({
    where: { id: target.id },
    data: { commissionRate: Math.max(0, Math.min(100, rate)) },
  });
  revalidatePath("/admin/organisateurs");
}

// ============ RETRAITS ORGANISATEURS (PAYOUTS FEDAPAY + OTP) ============

// Lance le virement FedaPay d'une demande de retrait (partagé entre le flux OTP
// auto et la validation admin). Retourne true si le virement a été déclenché.
async function executeFedaPayPayout(
  payout: { id: string; amount: number; phone: string; network: string; organizer: { name: string } }
): Promise<boolean> {
  if (!isFedaPayPayoutEnabled()) return false;
  try {
    const created = await createFedaPayPayout({
      amount: payout.amount,
      customerName: payout.organizer.name,
      phone: payout.phone,
      network: payout.network,
    });
    await startFedaPayPayouts([created.id]);
    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        status: PayoutStatus.PROCESSING,
        fedapayId: created.id,
        processedAt: new Date(),
      },
    });
    return true;
  } catch (e) {
    // Échec du virement : la demande reste en attente (réessayable), l'erreur est notée.
    await prisma.payout.update({
      where: { id: payout.id },
      data: {
        adminNote: e instanceof Error ? e.message.slice(0, 200) : "Échec du virement FedaPay",
        processedAt: new Date(),
      },
    });
    return false;
  }
}

// Étape 1 — L'organisateur demande le virement d'une partie de son solde vers son
// compte mobile money. La demande est créée (PENDING) et un code de validation
// (OTP) est envoyé par SMS + email : l'organisateur confirme LUI-MÊME son retrait
// via ce code (étape 2), sans dépendre de la disponibilité d'un admin.
export async function requestPayoutAction(formData: FormData) {
  const user = await requireUser(Role.ORGANIZER);
  const amount = parseInt(String(formData.get("amount") || "0"), 10);
  const network = String(formData.get("network") || "");
  const phone = String(formData.get("phone") || "").trim();

  // Numéro de destination : indicatif international conservé (ouverture Afrique).
  const payoutPhone = toE164(phone);
  const digits = phone.replace(/\D/g, "");
  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    digits.length < 8 ||
    !["MTN_MOMO", "MOOV_MONEY", "CELTIIS"].includes(network)
  ) {
    redirect("/transactions?payoutErr=1");
  }

  // Annule les demandes PENDING dont l'OTP n'a pas été confirmé à temps.
  await expireStalePendingPayouts(user.id);

  // Au maximum 3 demandes en attente à la fois (anti-abandon).
  const pendingCount = await prisma.payout.count({
    where: {
      organizerId: user.id,
      status: { in: [PayoutStatus.PENDING, PayoutStatus.PENDING_ADMIN, PayoutStatus.PROCESSING] },
    },
  });
  if (pendingCount >= 3) redirect("/transactions?payoutErr=2");

  // Le montant demandé ne peut pas dépasser le solde disponible.
  const available = await organizerAvailableBalance(user.id);
  if (amount > available) redirect("/transactions?payoutErr=3");

  // Le code de validation est envoyé au téléphone de l'organisateur (le compte),
  // PAS au numéro de destination : sécurise le retrait même si la destination
  // appartient à un tiers.
  const otpPhone = user.phone ? normalizePhone(user.phone) : null;
  if (!otpPhone) redirect("/transactions?payoutErr=1");

  const payout = await prisma.payout.create({
    data: {
      organizerId: user.id,
      amount,
      phone: payoutPhone,
      network,
    },
  });

  // Envoie le code de validation (SMS + email) puis redirige vers la saisie.
  await issueOtp({
    phone: otpPhone,
    email: user.email ?? user.orgEmail ?? undefined,
    name: user.name,
    purpose: "retrait",
  });
  revalidatePath("/transactions");
  redirect(`/transactions?payoutOtp=1&payoutId=${payout.id}`);
}

// Étape 2 — L'organisateur saisit le code reçu pour confirmer SON retrait.
//
//  - Montant ≤ seuil : le virement FedaPay est lancé immédiatement (l'OTP suffit).
//  - Montant > seuil : la demande passe en PENDING_ADMIN — un super admin doit
//    valider en plus du code (double sécurité pour les gros retraits).
//  - Sans FedaPay configuré : impossible de verser → en attente admin (réessayable).
export async function confirmPayoutOtpAction(formData: FormData) {
  const user = await requireUser(Role.ORGANIZER);
  const payoutId = String(formData.get("payoutId") || "");
  const otp = String(formData.get("otp") || "").trim();

  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: { organizer: true },
  });
  if (!payout || payout.organizerId !== user.id || payout.status !== PayoutStatus.PENDING) {
    redirect("/transactions?payoutErr=1");
  }
  if (!/^\d{6}$/.test(otp)) redirect(`/transactions?payoutOtp=1&payoutId=${payoutId}&payoutOtpErr=format`);

  // Anti-bot : 5 tentatives max par demande sur 10 min.
  const phone = user.phone ? normalizePhone(user.phone) : "";
  if (await isRateLimited(`payout-otp:${payoutId}`, 5, 10 * 60_000)) {
    redirect(`/transactions?payoutOtp=1&payoutId=${payoutId}&payoutOtpErr=rate_limited`);
  }

  // Vérifie le dernier OTP « retrait » non consommé et non expiré de l'organisateur.
  const otpRow = await prisma.otpCode.findFirst({
    where: { phone, code: otp, purpose: "retrait", consumed: false, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otpRow) redirect(`/transactions?payoutOtp=1&payoutId=${payoutId}&payoutOtpErr=bad`);
  await prisma.otpCode.update({ where: { id: otpRow.id }, data: { consumed: true } });
  await prisma.payout.update({ where: { id: payout.id }, data: { otpVerifiedAt: new Date() } });

  // Double sécurité : au-delà du seuil, la validation d'un admin est requise en
  // plus du code (la demande rejoint la file /admin/retraits).
  if (payout.amount > payoutAdminThreshold()) {
    await prisma.payout.update({
      where: { id: payout.id },
      data: { status: PayoutStatus.PENDING_ADMIN, adminNote: "Code validé — montant au-dessus du seuil, validation admin requise." },
    });
    revalidatePath("/transactions");
    redirect("/transactions?payoutOk=admin");
  }

  // Montant sous le seuil : l'OTP suffit → virement FedaPay direct.
  const executed = await executeFedaPayPayout(payout);
  revalidatePath("/transactions");
  if (executed) redirect("/transactions?payoutOk=1");
  // FedaPay non configuré / échec : la demande reste en attente admin (réessayable).
  await prisma.payout.update({
    where: { id: payout.id },
    data: { status: PayoutStatus.PENDING_ADMIN, adminNote: "Code validé — virement en attente (FedaPay non configuré ou indisponible)." },
  });
  redirect("/transactions?payoutOk=admin");
}

// Super admin : valide une demande de retrait PENDING_ADMIN (montant > seuil, ou
// FedaPay indisponible) en lançant le virement FedaPay, ou la refuse.
// Sans clé FedaPay configurée, aucun virement n'est possible (refus net).
export async function processPayoutAction(formData: FormData) {
  const admin = await requireUser(Role.SUPER_ADMIN);
  const payoutId = String(formData.get("payoutId") || "");
  const decision = String(formData.get("decision") || "");
  const note = String(formData.get("note") || "").trim() || null;

  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: { organizer: true },
  });
  if (!payout || payout.status !== PayoutStatus.PENDING_ADMIN) redirect("/admin/retraits");

  if (decision === "cancel") {
    await prisma.payout.update({
      where: { id: payoutId },
      data: {
        status: PayoutStatus.CANCELLED,
        adminNote: note,
        processedAt: new Date(),
        processedById: admin.id,
      },
    });
    revalidatePath("/admin/retraits");
    redirect("/admin/retraits");
  }

  if (decision !== "pay") redirect("/admin/retraits");

  // Mode démo : pas de clé FedaPay → le virement est impossible (on refuse).
  if (!isFedaPayPayoutEnabled()) redirect("/admin/retraits?payoutErr=1");

  const executed = await executeFedaPayPayout(payout);
  if (executed) {
    await prisma.payout.update({
      where: { id: payoutId },
      data: { adminNote: note, processedAt: new Date(), processedById: admin.id },
    });
  } else {
    await prisma.payout.update({
      where: { id: payoutId },
      data: { adminNote: note ?? "Échec du virement FedaPay", processedAt: new Date(), processedById: admin.id },
    });
  }
  revalidatePath("/admin/retraits");
  redirect("/admin/retraits");
}

// Super admin : rafraîchit le statut d'un retrait en cours auprès de FedaPay
// (sent → PAID, failed → FAILED).
export async function refreshPayoutStatusAction(payoutId: string) {
  await requireUser(Role.SUPER_ADMIN);
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout || payout.status !== PayoutStatus.PROCESSING || !payout.fedapayId) return;

  const fedapayStatus = await getFedaPayPayoutStatus(payout.fedapayId);
  if (fedapayStatus === "sent") {
    await prisma.payout.update({ where: { id: payoutId }, data: { status: PayoutStatus.PAID } });
  } else if (fedapayStatus === "failed") {
    await prisma.payout.update({ where: { id: payoutId }, data: { status: PayoutStatus.FAILED } });
  }
  revalidatePath("/admin/retraits");
}

// ============ ADMIN : liste noire ============
export async function blacklistTicketAction(ticketId: string, eventId: string, reason: string) {
  const user = await requireUser(Role.ORGANIZER);
  await requireOwnedEvent(eventId, user.id);

  const ticket = await prisma.ticket.findFirst({
    where: { id: ticketId, eventId },
    select: { id: true, status: true },
  });
  if (!ticket) return;

  // Toggle : si déjà en liste noire, on retire ; sinon on ajoute.
  const isBlacklisted = ticket.status === TicketStatus.BLACKLISTED;
  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: isBlacklisted ? TicketStatus.ISSUED : TicketStatus.BLACKLISTED,
      blacklistReason: isBlacklisted ? null : reason.trim() || null,
    },
  });
  revalidatePath(`/events/${eventId}`);
}

// ============ GESTION DES AGENTS ============

// Ouvre ou ferme les ventes en ligne de l'événement (la boutique reste accessible,
// mais l'achat est bloqué quand les ventes sont fermées).
export async function toggleSalesAction(eventId: string) {
  const user = await requireUser(Role.ORGANIZER);
  const event = await requireOwnedEvent(eventId, user.id);
  await prisma.event.update({
    where: { id: event.id },
    data: { salesOpen: !event.salesOpen },
  });
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/acheter/${event.salesSlug ?? ""}`);
}

// Modifie un événement (infos + catégories de billets). Les capacités ne peuvent pas
// descendre sous le nombre de billets déjà émis pour la catégorie / l'événement.
export async function updateEventAction(formData: FormData) {
  const user = await requireUser(Role.ORGANIZER);
  const eventId = String(formData.get("eventId") || "");
  const name = String(formData.get("name") || "").trim();
  const location = String(formData.get("location") || "").trim();
  const type = String(formData.get("type") || "").trim() || null;
  const description = String(formData.get("description") || "").trim() || null;
  const imageUrlRaw = String(formData.get("imageUrl") || "").trim() || null;
  const imageFile = formData.get("imageFile") as File | null;

  let imageUrl = imageUrlRaw;
  if (imageFile && imageFile.size > 0) {
    imageUrl = await uploadImageToStorage(imageFile);
  }
  const doorsOpen = String(formData.get("doorsOpen") || "").trim() || null;
  const contactName = String(formData.get("contactName") || "").trim() || null;
  const contactPhone = String(formData.get("contactPhone") || "").trim() || null;
  const salesAtDoor = formData.get("salesAtDoor") === "1";
  const maxPerCustomer = Math.max(1, Math.min(MAX_QUANTITY, parseInt(String(formData.get("maxPerCustomer") || "10"), 10) || 10));
  const dateStr = String(formData.get("date") || "");
  const endDateStr = String(formData.get("endDate") || "");
  const capacity = parseInt(String(formData.get("capacity") || "0"), 10);
  const modeRaw = String(formData.get("mode") || "");
  const mode = modeRaw === EventMode.INVITE || modeRaw === EventMode.COMBINED ? modeRaw : EventMode.PUBLIC;
  // Zones d'accès de l'événement (accréditations).
  const zones = normalizeZones(String(formData.get("zones") || ""));
  if (!eventId || !name || !location || !dateStr || !capacity) redirect(`/events/${eventId}?editErr=1`);

  await requireOwnedEvent(eventId, user.id);
  const date = new Date(dateStr);
  const endDate = endDateStr ? new Date(endDateStr) : null;
  if (endDate && endDate <= date) redirect(`/events/${eventId}?editErr=2`);

  // La capacité ne peut pas descendre sous « billets émis + réservations PENDING »
  // (cohérent avec la logique de réservation de createOrder).
  const [issuedCount, pendingCount] = await Promise.all([
    prisma.ticket.count({ where: { eventId } }),
    prisma.order.count({ where: { eventId, status: OrderStatus.PENDING } }),
  ]);
  const minCapacity = Math.max(1, issuedCount + pendingCount);

  await prisma.event.update({
    where: { id: eventId },
    data: {
      name,
      location,
      type,
      description,
      imageUrl,
      doorsOpen,
      contactName,
      contactPhone,
      salesAtDoor,
      maxPerCustomer,
      mode,
      zones,
      date,
      ...(endDate ? { endDate } : { endDate: null }),
      capacity: Math.max(capacity, minCapacity),
    },
  });

  // Catégories : id / nom / prix / capacité / zones (capacité bornée aux billets vendus).
  const catIds = formData.getAll("catId").map((v) => String(v));
  const catNames = formData.getAll("catName").map((v) => String(v).trim());
  const catPrices = formData.getAll("catPrice").map((v) => parseInt(String(v), 10) || 0);
  const catCapacities = formData.getAll("catCapacity").map((v) => parseInt(String(v), 10) || 0);
  const catZones = formData.getAll("catZones").map((v) => normalizeZones(String(v)));

  for (let i = 0; i < catIds.length; i++) {
    const catId = catIds[i];
    const catName = catNames[i] ?? "";
    if (!catId || !catName) continue;
    const [sold, catPending] = await Promise.all([
      prisma.ticket.count({ where: { eventId, categoryId: catId } }),
      prisma.order.count({ where: { eventId, categoryId: catId, status: OrderStatus.PENDING } }),
    ]);
    await prisma.ticketCategory.update({
      where: { id: catId },
      data: {
        name: catName,
        price: Math.max(0, catPrices[i] ?? 0),
        capacity: Math.max(sold + catPending, catCapacities[i] ?? 0),
        zones: catZones[i] ?? null,
      },
    });
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/acheter/${(await prisma.event.findUnique({ where: { id: eventId } }))?.salesSlug ?? ""}`);
  redirect(`/events/${eventId}?edited=1`);
}

// Recherche de billets par nom ou téléphone (agent de contrôle) : permet de retrouver
// le billet d'un client qui l'a perdu, puis de valider son entrée normalement.
export type SearchTicketResult = {
  id: string;
  code: string;
  guestName: string;
  guestPhone: string | null;
  status: TicketStatus;
  category: string | null;
  guestCount: number;
  entriesCount: number;
};

export async function searchTicketsAction(eventId: string, query: string): Promise<SearchTicketResult[]> {
  const user = await requireUser(Role.AGENT);
  const assignment = await prisma.eventAgent.findUnique({
    where: { eventId_agentId: { eventId, agentId: user.id } },
  });
  if (!assignment) return [];

  // Anti-bot : 30 recherches max par agent et par événement sur 10 s.
  if (await isRateLimited(`search:${user.id}:${eventId}`, 30, 10_000)) return [];

  const q = query.trim();
  if (!q) return [];
  const digits = q.replace(/\D/g, "");

  const tickets = await prisma.ticket.findMany({
    where: {
      eventId,
      OR: [
        ...(q ? [{ guestName: { contains: q } }] : []),
        ...(digits.length >= 4 ? [{ guestPhone: { contains: digits } }] : []),
      ],
    },
    include: { category: true },
    orderBy: { createdAt: "desc" },
    take: 15,
  });

  return tickets.map((t) => ({
    id: t.id,
    code: t.code,
    guestName: t.guestName,
    guestPhone: t.guestPhone,
    status: t.status,
    category: t.category?.name ?? null,
    guestCount: Math.max(1, t.guestCount || 1),
    entriesCount: t.entriesCount || 0,
  }));
}

function generatePin(): string {
  return String(randomInt(0, 10000)).padStart(4, "0");
}

// Secret éphémère affiché une seule fois (PIN agent / code d'activation terminal) :
// stocké dans un cookie httpOnly court (2 min), scopé au chemin de l'événement —
// jamais exposé dans l'historique, les logs serveur, ni sur d'autres pages.
const REVEAL_COOKIE = "sigma_reveal";
const REVEAL_TTL_S = 2 * 60;

async function stashRevealSecret(
  eventId: string,
  kind: "agentPin" | "terminalPin",
  secret: string,
  name: string
) {
  const store = await cookies();
  store.set(REVEAL_COOKIE, JSON.stringify({ kind, secret, name, eventId }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: REVEAL_TTL_S,
    // Le secret n'est envoyé que sur les pages de CET événement (et effacé sur
    // le même chemin) : il ne voyage pas sur tout le domaine.
    path: `/events/${eventId}`,
  });
}

// Consomme (efface) le secret éphémère après affichage par la page événement :
// un rechargement ne réaffiche jamais le PIN / code. L'effacement se fait sur le
// même chemin que la création (sinon le navigateur ne le supprime pas).
export async function consumeRevealAction() {
  const store = await cookies();
  const raw = store.get(REVEAL_COOKIE)?.value;
  let path = "/";
  if (raw) {
    try {
      const { eventId } = JSON.parse(raw) as { eventId?: string };
      if (eventId) path = `/events/${eventId}`;
    } catch {
      // Cookie invalide : effacement sur le chemin par défaut.
    }
  }
  // L'effacement doit cibler le même chemin que la création, sinon le navigateur
  // garde le cookie. (API Next.js : objet d'options avec `name`.)
  store.delete({ name: REVEAL_COOKIE, path });
}

// Crée un compte agent (ou réutilise un agent existant) et l'assigne à l'événement.
export async function addAgentAction(formData: FormData) {
  const user = await requireUser(Role.ORGANIZER);
  const eventId = String(formData.get("eventId") || "");
  const agentName = String(formData.get("agentName") || "").trim();
  const rawPhone = String(formData.get("agentPhone") || "").trim();
  if (!eventId || !agentName || !rawPhone) return;
  await requireOwnedEvent(eventId, user.id);

  const phone = normalizePhone(rawPhone);
  if (phone.length < 8) redirect(`/events/${eventId}?agentErr=2`);

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing?.role === Role.ORGANIZER) {
    redirect(`/events/${eventId}?agentErr=1`); // ce numéro est un compte organisateur
  }

  let agent = existing;
  let pin: string | null = null;
  if (!agent) {
    pin = generatePin();
    agent = await prisma.user.create({
      data: { name: agentName, phone, pin: hashPin(pin), role: Role.AGENT },
    });
  }

  const alreadyAssigned = await prisma.eventAgent.findUnique({
    where: { eventId_agentId: { eventId, agentId: agent.id } },
  });
  if (!alreadyAssigned) {
    await prisma.eventAgent.create({ data: { eventId, agentId: agent.id } });
  }

  revalidatePath(`/events/${eventId}`);
  if (pin) {
    // PIN affiché une seule fois : jamais dans l'URL (historique + logs serveur) —
    // un cookie httpOnly éphémère est consommé à la lecture par la page.
    await stashRevealSecret(eventId, "agentPin", pin, agentName);
    redirect(`/events/${eventId}?agentCreated=1`);
  }
  redirect(`/events/${eventId}?agentAssigned=1`);
}

// Génère un nouveau PIN pour un agent et l'affiche une seule fois (il a oublié le sien).
// 🔒 L'agent doit être assigné À CET ÉVÉNEMENT (pas seulement exister) : un organisateur
// ne peut pas réinitialiser le PIN d'un agent qui travaille pour un autre organisateur.
export async function resetAgentPinAction(eventId: string, agentId: string) {
  const user = await requireUser(Role.ORGANIZER);
  await requireOwnedEvent(eventId, user.id);
  const assignment = await prisma.eventAgent.findUnique({
    where: { eventId_agentId: { eventId, agentId } },
    include: { agent: true },
  });
  if (!assignment) redirect(`/events/${eventId}`);
  const pin = generatePin();
  await prisma.user.update({ where: { id: assignment.agent.id }, data: { pin: hashPin(pin) } });
  // Nouveau PIN affiché une seule fois (cookie éphémère, jamais dans l'URL).
  await stashRevealSecret(eventId, "agentPin", pin, assignment.agent.name);
  redirect(`/events/${eventId}?agentReset=1`);
}

// ============ SIGMA SCANNER : TERMINAUX + URGENCE ============

// Crée un terminal (porte) pour l'événement et génère un code d'activation temporaire.
export async function createTerminalAction(formData: FormData) {
  const user = await requireUser(Role.ORGANIZER);
  const eventId = String(formData.get("eventId") || "");
  const name = String(formData.get("terminalName") || "").trim();
  const zone = String(formData.get("terminalZone") || "").trim() || null;
  if (!eventId || !name) redirect(`/events/${eventId}`);
  await requireOwnedEvent(eventId, user.id);
  const terminal = await createTerminal({ eventId, name, zone });
  revalidatePath(`/events/${eventId}`);
  if (terminal.activationCode) {
    await stashRevealSecret(eventId, "terminalPin", terminal.activationCode, terminal.name);
    redirect(`/events/${eventId}?terminalCreated=1`);
  }
  redirect(`/events/${eventId}`);
}

// Régénère le code d'activation d'un terminal (l'ancien expire immédiatement).
export async function regenerateTerminalCodeAction(eventId: string, terminalId: string) {
  const user = await requireUser(Role.ORGANIZER);
  await requireOwnedEvent(eventId, user.id);
  const terminal = await regenerateActivationCode(terminalId);
  revalidatePath(`/events/${eventId}`);
  if (terminal.activationCode) {
    await stashRevealSecret(eventId, "terminalPin", terminal.activationCode, terminal.name);
    redirect(`/events/${eventId}?terminalRegenerated=1`);
  }
  redirect(`/events/${eventId}`);
}

// Active / désactive / révoque un terminal. Révocation = définitif (token invalidé).
export async function setTerminalStatusAction(eventId: string, terminalId: string, status: TerminalStatus) {
  const user = await requireUser(Role.ORGANIZER);
  await requireOwnedEvent(eventId, user.id);
  if (status === TerminalStatus.REVOKED) {
    // Révocation : invalide le token pour couper immédiatement le terminal.
    await prisma.terminal.update({
      where: { id: terminalId },
      data: { status: TerminalStatus.REVOKED, token: null, tokenExpiresAt: null, activationCode: null, activationCodeExpiresAt: null },
    });
  } else if (status === TerminalStatus.DISABLED) {
    await prisma.terminal.update({ where: { id: terminalId }, data: { status: TerminalStatus.DISABLED, token: null, tokenExpiresAt: null } });
  } else {
    // Réactivation : nouveau code d'activation à saisir.
    await prisma.terminal.update({
      where: { id: terminalId },
      data: {
        status: TerminalStatus.INACTIVE,
        token: null,
        tokenExpiresAt: null,
        activationCode: generateActivationCode(),
        activationCodeExpiresAt: new Date(Date.now() + ACTIVATION_CODE_TTL_MS),
      },
    });
  }
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

// Change la porte / zone d'accès d'un terminal.
export async function setTerminalZoneAction(formData: FormData) {
  const user = await requireUser(Role.ORGANIZER);
  const eventId = String(formData.get("eventId") || "");
  const terminalId = String(formData.get("terminalId") || "");
  const zone = String(formData.get("terminalZone") || "").trim() || null;
  await requireOwnedEvent(eventId, user.id);
  await prisma.terminal.update({ where: { id: terminalId }, data: { zone } });
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}`);
}

// Fonction urgence : suspend / rétablit TOUTES les entrées (terminaux + app web).
export async function toggleEntranceBlockedAction(eventId: string) {
  const user = await requireUser(Role.ORGANIZER);
  const event = await requireOwnedEvent(eventId, user.id);
  const next = !event.entranceBlocked;
  await prisma.event.update({ where: { id: event.id }, data: { entranceBlocked: next } });
  // Temps réel : avertit les terminaux connectés via le canal événement.
  if (next) {
    void publishLiveNotification(user.id, {
      kind: "gauge",
      title: `${event.name} — entrées suspendues`,
      desc: "La fonction urgence a été activée. Aucune entrée n'est acceptée.",
      href: `/events/${event.id}`,
    });
  }
  void publishEventUpdate(event.id, { entranceBlocked: next });
  revalidatePath(`/events/${eventId}`);
  redirect(`/events/${eventId}?blocked=${next ? "1" : "0"}`);
}

// Génère le lien de vente d'un événement créé avant cette fonctionnalité (salesSlug absent).
export async function generateSalesSlugAction(eventId: string) {
  const user = await requireUser(Role.ORGANIZER);
  const event = await requireOwnedEvent(eventId, user.id);
  if (event.salesSlug) redirect(`/events/${event.id}`);
  const salesSlug = await generateSalesSlug(event.id, event.name);
  await prisma.event.update({ where: { id: event.id }, data: { salesSlug } });
  revalidatePath(`/events/${event.id}`);
  redirect(`/events/${event.id}?salesLink=1`);
}

// Annule une commande en attente (PENDING) pour libérer les places qu'elle réservait.
export async function cancelPendingOrderAction(eventId: string, orderId: string) {
  const user = await requireUser(Role.ORGANIZER);
  await requireOwnedEvent(eventId, user.id);
  await prisma.order.updateMany({
    where: { id: orderId, eventId, status: OrderStatus.PENDING },
    data: { status: OrderStatus.CANCELLED },
  });
  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/acheter/${(await prisma.event.findUnique({ where: { id: eventId } }))?.salesSlug ?? ""}`);
}

// Retire un agent de l'événement (il ne pourra plus scanner pour cet événement).
export async function removeAgentAction(eventId: string, agentId: string) {
  const user = await requireUser(Role.ORGANIZER);
  await requireOwnedEvent(eventId, user.id);
  await prisma.eventAgent.deleteMany({ where: { eventId, agentId } });
  revalidatePath(`/events/${eventId}`);
}

// ============ SYNCHRONISATION HORS-LIGNE ============

export type OfflineEntry = {
  syncId: string; // UUID généré côté client → idempotence
  code: string;
  scannedAt: string; // ISO : horodatage d'origine conservé (anti-rejeu)
  lat?: number | null;
  lng?: number | null;
};

export type OfflineSyncResult = {
  synced: number; // entrées enregistrées (tout statut confondu)
  alreadySynced: number; // déjà synchronisées (anti-doublon)
  failed: number; // erreurs inattendues → restent dans la file
  processedIds: string[]; // syncId à retirer de la file côté client
};

// Cœur de synchronisation : applique les scans hors-ligne en gardant le serveur
// comme source de vérité. `ctx` permet de distinguer un agent web d'un terminal
// (zone de la porte, terminalId, suspension d'urgence).
async function runSyncCore(
  eventId: string,
  entries: OfflineEntry[],
  ctx: { agentId: string; terminalId?: string; zone?: string | null }
): Promise<OfflineSyncResult> {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { synced: 0, alreadySynced: 0, failed: entries.length, processedIds: [] };

  // Fonction urgence : si les entrées sont suspendues, AUCUN scan hors-ligne ne
  // peut être validé (le serveur est la source de vérité, pas le terminal).
  const suspended = event.entranceBlocked;

  // Anti-rejeu : la première horodatée gagne.
  const sorted = [...entries].sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));

  let synced = 0;
  let alreadySynced = 0;
  let failed = 0;
  const processedIds: string[] = [];

  const baseOptions = (entry: OfflineEntry, scannedAt: Date) => ({
    source: ctx.terminalId ? "TERMINAL" : "OFFLINE",
    syncId: entry.syncId,
    scannedAt,
    revalidate: false,
    geo: entry,
    terminalId: ctx.terminalId,
  });

  for (const entry of sorted) {
    try {
      // Idempotence : déjà synchronisée ?
      const existing = await prisma.checkIn.findUnique({ where: { syncId: entry.syncId } });
      if (existing) {
        alreadySynced++;
        processedIds.push(entry.syncId);
        continue;
      }

      const scannedAt = new Date(entry.scannedAt);

      // Fonction urgence : tout est tracé SUSPENDED (refus), sans consommer de place.
      if (suspended) {
        await logCheckIn(eventId, null, ctx.agentId, CheckInStatus.SUSPENDED, baseOptions(entry, scannedAt));
        synced++;
        processedIds.push(entry.syncId);
        continue;
      }

      // QR chiffré (blob) → déchiffrement + id ; code en clair → par code.
      const ticketWhere = ticketWhereFromScan(entry.code);
      if (!ticketWhere) {
        await logCheckIn(eventId, null, ctx.agentId, CheckInStatus.INVALID, baseOptions(entry, scannedAt));
        synced++;
        processedIds.push(entry.syncId);
        continue;
      }
      const ticket = await prisma.ticket.findUnique({
        where: ticketWhere,
        include: { category: true },
      });

      // Billet inconnu → INVALID tracé
      if (!ticket || ticket.eventId !== eventId) {
        await logCheckIn(eventId, ticket?.id ?? null, ctx.agentId, CheckInStatus.INVALID, baseOptions(entry, scannedAt));
        synced++;
        processedIds.push(entry.syncId);
        continue;
      }

      // Droits d'accès par zone (accréditations) : porte non autorisée → refus.
      if (ctx.zone && ticket.category?.zones) {
        const allowed = ticket.category.zones.split(",").map((z) => z.trim().toLowerCase());
        if (!allowed.includes(ctx.zone.toLowerCase())) {
          await logCheckIn(eventId, ticket.id, ctx.agentId, CheckInStatus.WRONG_ZONE, baseOptions(entry, scannedAt));
          synced++;
          processedIds.push(entry.syncId);
          continue;
        }
      }

      // Liste noire
      if (ticket.status === TicketStatus.BLACKLISTED) {
        await logCheckIn(eventId, ticket.id, ctx.agentId, CheckInStatus.BLACKLISTED, baseOptions(entry, scannedAt));
        synced++;
        processedIds.push(entry.syncId);
        continue;
      }

      // Validité temporelle (évaluée à l'horodatage d'origine du scan)
      const temporal = temporalStatus(event, scannedAt);
      if (temporal) {
        await logCheckIn(eventId, ticket.id, ctx.agentId, temporal, baseOptions(entry, scannedAt));
        synced++;
        processedIds.push(entry.syncId);
        continue;
      }

      // Capacité maximale (chaque personne entrée compte une place)
      const entered = await prisma.checkIn.count({
        where: { eventId, status: { in: [CheckInStatus.VALID, CheckInStatus.ENTRY] } },
      });
      if (entered >= event.capacity) {
        await logCheckIn(eventId, ticket.id, ctx.agentId, CheckInStatus.FULL, baseOptions(entry, scannedAt));
        synced++;
        processedIds.push(entry.syncId);
        continue;
      }

      // Invitation entièrement consommée : anti-rejeu — la première horodatée gagne.
      const guestCount = Math.max(1, ticket.guestCount || 1);
      if (ticket.status === TicketStatus.ENTERED || ticket.entriesCount >= guestCount) {
        const existing = await prisma.checkIn.findFirst({
          where: { ticketId: ticket.id, status: { in: [CheckInStatus.VALID, CheckInStatus.ENTRY] } },
          orderBy: { scannedAt: "asc" },
        });
        if (existing && scannedAt < existing.scannedAt) {
          // Ce scan hors-ligne est antérieur : il remporte l'entrée, l'autre devient « déjà scanné ».
          await prisma.$transaction([
            prisma.checkIn.update({ where: { id: existing.id }, data: { status: CheckInStatus.ALREADY_SCANNED } }),
            prisma.checkIn.create({
              data: {
                ticketId: ticket.id,
                eventId,
                agentId: ctx.agentId,
                ...(ctx.terminalId ? { terminalId: ctx.terminalId } : {}),
                status: CheckInStatus.VALID,
                source: ctx.terminalId ? "TERMINAL" : "OFFLINE",
                syncId: entry.syncId,
                scannedAt,
                ...(entry.lat != null ? { lat: entry.lat } : {}),
                ...(entry.lng != null ? { lng: entry.lng } : {}),
              },
            }),
          ]);
        } else {
          await logCheckIn(eventId, ticket.id, ctx.agentId, CheckInStatus.ALREADY_SCANNED, baseOptions(entry, scannedAt));
        }
        synced++;
        processedIds.push(entry.syncId);
        continue;
      }

      // Entrée autorisée : une personne de plus (VALID à la dernière entrée, sinon ENTRY).
      const nextCount = ticket.entriesCount + 1;
      const complete = nextCount >= guestCount;
      await prisma.$transaction([
        prisma.ticket.update({
          where: { id: ticket.id },
          data: {
            entriesCount: nextCount,
            status: complete ? TicketStatus.ENTERED : TicketStatus.ISSUED,
            inviteStatus: complete ? InvitationStatus.ENTERED : ticket.inviteStatus,
          },
        }),
        prisma.checkIn.create({
          data: {
            ticketId: ticket.id,
            eventId,
            agentId: ctx.agentId,
            ...(ctx.terminalId ? { terminalId: ctx.terminalId } : {}),
            status: complete ? CheckInStatus.VALID : CheckInStatus.ENTRY,
            source: ctx.terminalId ? "TERMINAL" : "OFFLINE",
            syncId: entry.syncId,
            scannedAt,
            ...(entry.lat != null ? { lat: entry.lat } : {}),
            ...(entry.lng != null ? { lng: entry.lng } : {}),
          },
        }),
      ]);
      synced++;
      processedIds.push(entry.syncId);
    } catch {
      // Erreur inattendue → on garde l'entrée dans la file
      failed++;
    }
  }

  if (synced > 0) {
    await maybeTriggerCapacityAlerts(eventId, event.capacity);
    revalidatePath(`/events/${eventId}`);
  }
  return { synced, alreadySynced, failed, processedIds };
}

export async function syncOfflineAction(
  eventId: string,
  entries: OfflineEntry[]
): Promise<OfflineSyncResult> {
  // 🔒 Autorisation : seul un agent assigné à l'événement peut synchroniser.
  const user = await requireUser(Role.AGENT);
  const assignment = await prisma.eventAgent.findUnique({
    where: { eventId_agentId: { eventId, agentId: user.id } },
  });
  if (!assignment) {
    return { synced: 0, alreadySynced: 0, failed: entries.length, processedIds: [] };
  }

  // Anti-bot : 30 synchronisations max par agent et par événement sur 10 s.
  if (await isRateLimited(`sync:${user.id}:${eventId}`, 30, 10_000)) {
    return { synced: 0, alreadySynced: 0, failed: entries.length, processedIds: [] };
  }

  return runSyncCore(eventId, entries, { agentId: user.id });
}

// Synchronisation depuis un terminal SIGMA Scanner (authentifié par token).
export async function syncTerminalAction(
  terminalId: string,
  entries: OfflineEntry[]
): Promise<OfflineSyncResult> {
  const terminal = await prisma.terminal.findUnique({
    where: { id: terminalId },
    select: { id: true, eventId: true, status: true, zone: true, agentId: true },
  });
  if (!terminal || terminal.status !== TerminalStatus.ACTIVE || !terminal.agentId) {
    return { synced: 0, alreadySynced: 0, failed: entries.length, processedIds: [] };
  }
  if (await isRateLimited(`terminal-sync:${terminalId}`, 30, 10_000)) {
    return { synced: 0, alreadySynced: 0, failed: entries.length, processedIds: [] };
  }

  const result = await runSyncCore(terminal.eventId, entries, {
    agentId: terminal.agentId,
    terminalId: terminal.id,
    zone: terminal.zone,
  });

  await prisma.terminal
    .update({ where: { id: terminal.id }, data: { lastSeenAt: new Date() } })
    .catch(() => {});
  return result;
}

