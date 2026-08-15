import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { OrderStatus, DeliveryMethod, InvitationStatus } from "@/app/generated/prisma/enums";
import { normalizePhone } from "@/lib/csv";
import { MOMO_NETWORKS } from "@/lib/momo";

const APP_URL = process.env.APP_URL || "http://localhost:3000";

// Durée par défaut d'un événement si endDate absente (alignée sur lib/actions).
export const DEFAULT_EVENT_DURATION_MS = 8 * 3600_000;

// Durée de vie d'une commande PENDING : au-delà, les places réservées sont libérées
// (client qui abandonne le paiement). La page de paiement doit être terminée avant.
export const ORDER_EXPIRY_MS = 20 * 60_000; // 20 minutes

// Modèle économique FedaPay (brief sigma-events-commissions-brief-1.md) :
//  - Livraison UNIFIÉE à 50 FCFA par commande, quel que soit le canal choisi.
//  - La commission FedaPay (~2 %) est intégrée au prix affiché par GROSS-UP
//    (prix_affiché_client = prix_net / (1 − marge)) — cf. lib/pricing.ts.
//  - La commission Sigma (3 % par défaut) + la livraison restent chez SIGMA ;
//    l'organisateur reçoit prix billet − commission.

// Ré-export du module client-safe de tarification (constantes + calculs purs).
// Les composants client importent lib/pricing (sans Prisma) ; le code serveur
// passe ici pour la cohérence.
import { DELIVERY_FEE } from "@/lib/pricing";
export { DELIVERY_FEE, FEDAPAY_MARGIN, grossUpFedaPay, clientTotal } from "@/lib/pricing";

// Frais de livraison du billet : unifiés à 50 FCFA par commande.
export const DELIVERY_FEES: Record<DeliveryMethod, number> = {
  [DeliveryMethod.DOWNLOAD]: DELIVERY_FEE,
  [DeliveryMethod.EMAIL]: DELIVERY_FEE,
  [DeliveryMethod.WHATSAPP]: DELIVERY_FEE,
};

// Slug lisible à partir du nom de l'événement (accents retirés, tirets).
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function randomSuffix(len: number): string {
  return randomBytes(len).toString("hex").slice(0, len);
}

// Génère un slug de vente unique pour l'événement : nom-lisible-XXXX
export async function generateSalesSlug(eventId: string, name: string): Promise<string> {
  const base = slugify(name) || "evenement";
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = `${base}-${randomSuffix(4)}`;
    const exists = await prisma.event.findUnique({ where: { salesSlug: candidate } });
    if (!exists) return candidate;
  }
  return `${base}-${randomSuffix(8)}`;
}

// Référence de facture : SIG-XXXXXX
export function generateReference(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let ref = "";
  for (let i = 0; i < 6; i++) ref += chars[randomBytes(1)[0] % chars.length];
  return `SIG-${ref}`;
}

export function purchaseUrl(slug: string): string {
  return `${APP_URL}/acheter/${slug}`;
}

export type SalesWindow = {
  salesOpen: boolean | null;
  date: Date;
  endDate: Date | null;
  status: string; // EventStatus : DRAFT | LIVE | DONE
  salesAtDoor: boolean | null;
};

// La vente est fermée si :
//  - l'organisateur l'a fermée (salesOpen = false),
//  - l'événement est un brouillon (DRAFT) ou terminé (DONE),
//  - l'événement a commencé et la vente à la porte est désactivée (salesAtDoor = false),
//  - l'événement est entièrement terminé (date + durée dépassée).
// Avec vente à la porte (défaut), on tolère l'achat pendant l'événement : la référence
// est la FIN et non le début.
export function isSalesOpen(event: SalesWindow): boolean {
  if (event.salesOpen === false) return false;
  if (event.status === "DRAFT" || event.status === "DONE") return false;
  const end = event.endDate ?? new Date(event.date.getTime() + DEFAULT_EVENT_DURATION_MS);
  const limit = event.salesAtDoor === false ? event.date : end;
  return new Date() <= limit;
}

export const MAX_QUANTITY = 10;

export type CreateOrderInput = {
  eventId: string;
  categoryId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  quantity?: number; // nombre de billets (1 par défaut, max 10)
};

export type ShopResult =
  | { ok: true; orderId: string; reference: string; amount: number; quantity: number }
  | {
      ok: false;
      error: "EVENT_NOT_FOUND" | "CATEGORY_NOT_FOUND" | "SOLD_OUT" | "NOT_ENOUGH_SEATS" | "SALES_CLOSED" | "INVALID_INPUT";
    };

export class ShopSoldOutError extends Error {}
export class ShopNotEnoughSeatsError extends Error {}

// Annule les commandes PENDING plus vieilles que ORDER_EXPIRY_MS : les places
// qu'elles réservaient redeviennent disponibles. Appelé avant chaque contrôle de
// capacité et sur les pages qui affichent les réservations.
export async function expireStalePendingOrders(): Promise<number> {
  const cutoff = new Date(Date.now() - ORDER_EXPIRY_MS);
  const res = await prisma.order.updateMany({
    where: { status: OrderStatus.PENDING, createdAt: { lt: cutoff } },
    data: { status: OrderStatus.CANCELLED },
  });
  return res.count;
}

// Crée la commande (PENDING) après contrôle de capacité.
export async function createOrder(input: CreateOrderInput): Promise<ShopResult> {
  const name = input.customerName.trim();
  // Numéro normalisé (retire +229 / 00229 / espaces) — cohérent avec les imports CSV
  // et la page « retrouver mon billet », et garantit un lien WhatsApp correct.
  const phone = normalizePhone(input.customerPhone);
  const qtyRaw = Number.isFinite(input.quantity) ? (input.quantity as number) : 1;
  if (!name || phone.length < 8) return { ok: false, error: "INVALID_INPUT" };

  const event = await prisma.event.findUnique({
    where: { id: input.eventId },
    include: { categories: true },
  });
  if (!event) return { ok: false, error: "EVENT_NOT_FOUND" };

  // Ventes fermées (organisateur, statut, vente à la porte, événement terminé).
  if (!isSalesOpen(event)) return { ok: false, error: "SALES_CLOSED" };

  // Quantité bornée : globalement (1-10) et à la limite d'achat de l'événement.
  const quantity = Math.max(1, Math.min(MAX_QUANTITY, event.maxPerCustomer ?? MAX_QUANTITY, Math.floor(qtyRaw)));

  const category = event.categories.find((c) => c.id === input.categoryId);
  if (!category) return { ok: false, error: "CATEGORY_NOT_FOUND" };

  // Libère d'abord les places des commandes abandonnées (PENDING expirées), puis
  // compte la capacité = billets émis + commandes PENDING encore valides.
  await expireStalePendingOrders();
  const reference = generateReference();
  try {
    const order = await prisma.$transaction(async (tx) => {
      // SQLite: On force un verrouillage immédiat pour éviter les race conditions
      // en forçant la transaction à être exclusive dès le début.
      // Avec Prisma/SQLite, on peut simuler cela en effectuant une petite écriture
      // ou en utilisant un mode de transaction spécifique si supporté.
      // Ici, on s'assure que le comptage et la création sont atomiques.
      
      const [catTickets, catPending, allTickets, allPending] = await Promise.all([
        tx.ticket.count({ where: { eventId: event.id, categoryId: category.id } }),
        tx.order.count({ where: { eventId: event.id, categoryId: category.id, status: OrderStatus.PENDING } }),
        tx.ticket.count({ where: { eventId: event.id } }),
        tx.order.count({ where: { eventId: event.id, status: OrderStatus.PENDING } }),
      ]);

      const categoryUsed = catTickets + catPending;
      const totalUsed = allTickets + allPending;
      const catAvailable = category.capacity - categoryUsed;
      const totalAvailable = event.capacity - totalUsed;

      // Plus aucune place → complet. De la place mais pas assez pour la quantité → message dédié.
      if (catAvailable <= 0 || totalAvailable <= 0) throw new ShopSoldOutError();
      if (catAvailable < quantity || totalAvailable < quantity) throw new ShopNotEnoughSeatsError();

      return tx.order.create({
        data: {
          reference,
          eventId: event.id,
          categoryId: category.id,
          customerName: name,
          customerPhone: phone,
          customerEmail: input.customerEmail?.trim() || null,
          amount: category.price * quantity,
          quantity,
          status: OrderStatus.PENDING,
        },
      });
    });
    return { ok: true, orderId: order.id, reference, amount: category.price * quantity, quantity };
  } catch (e) {
    if (e instanceof ShopSoldOutError) return { ok: false, error: "SOLD_OUT" };
    if (e instanceof ShopNotEnoughSeatsError) return { ok: false, error: "NOT_ENOUGH_SEATS" };
    throw e;
  }
}// Confirme le paiement d'une commande PENDING : contrôle de capacité + émission
// des billets QR + passage PAID, en une transaction atomique.
// Partagé entre le paiement **simulé** (simulatePayment) et le webhook de la
// passerelle **réelle** (app/api/webhook/dodo) — même logique, même anti-fraude.
export async function confirmOrderPaid(
  orderId: string,
  opts: { paymentMethod: string; delivery?: string }
): Promise<ShopResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { event: true, category: true },
  });
  if (!order) return { ok: false, error: "EVENT_NOT_FOUND" };
  if (order.status === OrderStatus.PAID) {
    return { ok: true, orderId: order.id, reference: order.reference, amount: order.amount, quantity: order.quantity };
  }
  if (order.status === OrderStatus.CANCELLED) return { ok: false, error: "INVALID_INPUT" };

  // Méthode de livraison validée : DOWNLOAD | EMAIL | WHATSAPP (sinon téléchargement gratuit).
  const safeDelivery =
    opts.delivery === DeliveryMethod.EMAIL ||
    opts.delivery === DeliveryMethod.WHATSAPP ||
    opts.delivery === DeliveryMethod.DOWNLOAD
      ? (opts.delivery as DeliveryMethod)
      : undefined;

  // Libère les places des autres commandes abandonnées avant de re-vérifier la capacité,
  // puis émet les billets en une seule transaction : deux paiements simultanés sur les
  // dernières places ne peuvent pas dépasser la capacité.
  await expireStalePendingOrders();

  // Le sweep a pu annuler CETTE commande (client lent > 20 min) : on refuse alors proprement.
  const stillPending = await prisma.order.findUnique({
    where: { id: order.id },
    select: { status: true },
  });
  if (stillPending?.status !== OrderStatus.PENDING) {
    return { ok: false, error: "INVALID_INPUT" };
  }
  try {
    await prisma.$transaction(async (tx) => {
      // SQLite: On s'assure que le comptage et la création sont atomiques 
      // pour éviter la survente en cas de requêtes concurrentes.
      const [catTickets, catPending, allTickets, allPending] = await Promise.all([
        tx.ticket.count({ where: { eventId: order.eventId, categoryId: order.categoryId ?? undefined } }),
        tx.order.count({ where: { eventId: order.eventId, categoryId: order.categoryId ?? undefined, status: OrderStatus.PENDING } }),
        tx.ticket.count({ where: { eventId: order.eventId } }),
        tx.order.count({ where: { eventId: order.eventId, status: OrderStatus.PENDING } }),
      ]);

      const categoryUsed = catTickets + catPending;
      const totalUsed = allTickets + allPending;
      if (
        (order.category && categoryUsed > order.category.capacity) ||
        totalUsed > order.event.capacity
      ) {
        await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.CANCELLED } });
        throw new ShopSoldOutError();
      }

      // Émet N billets (la commande a réservé `quantity` places à sa création).
      const quantity = Math.max(1, order.quantity || 1);
      for (let i = 0; i < quantity; i++) {
        await tx.ticket.create({
          data: {
            eventId: order.eventId,
            categoryId: order.categoryId,
            // Code en MAJUSCULES : les recherches (page /t/, scanner) normalisent en
            // majuscules — les codes stockés doivent l'être aussi.
            code: crypto.randomUUID().replace(/-/g, "").toUpperCase(),
            guestName: order.customerName,
            guestPhone: order.customerPhone,
            orderId: order.id,
            // Le billet acheté entre dans le cycle de vie : son QR existe (GÉNÉRÉ).
            inviteStatus: InvitationStatus.GENERATED,
          },
        });
      }

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          paidAt: new Date(),
          // Méthode fournie par l'appelant : réseau simulé (_DEMO) ou passerelle réelle.
          paymentMethod: opts.paymentMethod,
          // Livraison choisie par le client avant paiement (frais de service éventuels).
          ...(safeDelivery ? { deliveryMethod: safeDelivery, deliveryFee: DELIVERY_FEES[safeDelivery] } : {}),
        },
      });
    });
  } catch (e) {
    if (e instanceof ShopSoldOutError) return { ok: false, error: "SOLD_OUT" };
    throw e;
  }

  return {
    ok: true,
    orderId: order.id,
    reference: order.reference,
    amount: order.amount,
    quantity: order.quantity,
  };
}

// Simule la validation du paiement (passerelle non branchée) : la commande passe PAID
// et le(s) billet(s) QR sont émis avec les infos du client.
// `networkId` = réseau mobile money choisi par le client (MTN_MOMO, MOOV_MONEY…),
// validé côté serveur : toute valeur inconnue retombe sur le défaut (MTN MoMo).
export async function simulatePayment(orderId: string, networkId?: string, delivery?: string): Promise<ShopResult> {
  const safeNetwork = MOMO_NETWORKS.some((n) => n.id === networkId) ? networkId : undefined;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { amount: true },
  });
  if (!order) return { ok: false, error: "EVENT_NOT_FOUND" };
  // Billet gratuit (0 FCFA) : pas de réseau ; sinon réseau choisi, sinon défaut.
  const paymentMethod = safeNetwork ? `${safeNetwork}_DEMO` : order.amount === 0 ? "FREE" : "MOMO_DEMO";
  return confirmOrderPaid(orderId, { paymentMethod, delivery });
}
