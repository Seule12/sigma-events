// Événements post-paiement, partagés entre la server action (paiement simulé)
// et le webhook de la passerelle réelle : notification temps réel à l'organisateur,
// mise à jour du canal événement, et mise en file des emails (facture + billet).

import { prisma } from "@/lib/prisma";
import { DeliveryMethod } from "@/app/generated/prisma/enums";
import { clientTotal } from "@/lib/shop";
import { publishLiveNotification, publishEventUpdate } from "@/lib/ably";
import { enqueueEmail } from "@/lib/queue";
import { sendWhatsApp, ticketMessage, trackPendingTicketRequest } from "@/lib/whatsapp";

export async function notifyOrderPaid(orderId: string): Promise<void> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { event: true, tickets: true },
  });
  if (!order) return;

  const firstTicket = order.tickets[0];
  const ticketUrl = firstTicket
    ? `${process.env.APP_URL || "http://localhost:3000"}/t/${firstTicket.code}`
    : undefined;

  // Livraison WhatsApp : on track la demande pour que le client écrive en premier.
  // Si pas de message après 5 min → envoi automatique du billet PNG.
  if (order.deliveryMethod === DeliveryMethod.WHATSAPP && firstTicket) {
    trackPendingTicketRequest(order.id, order.customerPhone);
    console.log(`[order-events] WhatsApp en attente : commande ${order.id} (${order.customerPhone})`);
  }

  void publishLiveNotification(order.event.organizerId, {
    kind: "payment",
    // Montant tout compris payé par le client (billets + livraison + frais).
    title: `Paiement reçu : ${clientTotal(order).toLocaleString("fr-FR")} FCFA`,
    desc: `${order.event.name} — ${order.customerName} · ${order.reference}`,
    href: `/transactions`,
  });
  void publishEventUpdate(order.eventId, { paid: true, reference: order.reference });

  if (order.customerEmail) {
    void enqueueEmail({
      type: "invoice",
      to: order.customerEmail,
      customerName: order.customerName,
      eventName: order.event.name,
      reference: order.reference,
      amount: order.amount,
      deliveryFee: order.deliveryFee || 0,
      ticketUrl: ticketUrl ?? "",
    });
    void enqueueEmail({
      type: "ticket",
      to: order.customerEmail,
      customerName: order.customerName,
      eventName: order.event.name,
      reference: order.reference,
      ticketCount: order.tickets.length,
      amount: clientTotal(order),
      ticketUrl: ticketUrl ?? "",
    });
  }
}
