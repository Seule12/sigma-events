import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OrderStatus, DeliveryMethod } from "@/app/generated/prisma/enums";
import Logo from "@/components/logo";
import ConfirmationPoll from "@/components/confirmation-poll";
import StkPushWaiting from "@/components/stk-push-waiting";
import WhatsAppBilletButton from "@/components/whatsapp-billet-button";
import { formatFcfa, displayPhone } from "@/lib/format";
import { purchaseUrl, clientTotal } from "@/lib/shop";
import { ticketQrDataUrl } from "@/lib/qr";
import { paymentMethodLabel } from "@/lib/momo";
import { ticketRef } from "@/lib/ticket-ref";

export const metadata = {
  title: "Achat confirmé",
};

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { event: true, category: true, tickets: true },
  });
  if (!order) notFound();

  // Le client revient du checkout Dodo : le webhook peut ne pas encore avoir
  // confirmé le paiement → page « confirmation en cours » avec rechargement auto.
  const waitingConfirmation =
    order.status !== OrderStatus.PAID &&
    (order.externalPaymentId || order.status === OrderStatus.PENDING);
  if (waitingConfirmation) {
    const isFeexPayStk = order.externalProvider === "feexpay" && order.externalPaymentId;
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4 dark:from-slate-950 dark:to-slate-900">
        <div className="animate-fade-up w-full max-w-md text-center">
          <div className="mb-6 flex justify-center">
            <Logo height={40} className="rounded-xl bg-slate-950 p-1.5" />
          </div>

          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Confirmation du paiement</h1>

          {isFeexPayStk ? (
            <div className="mt-4">
              <StkPushWaiting orderId={order.id} />
            </div>
          ) : (
            <div className="mt-4">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center">
                <svg className="h-10 w-10 animate-spin text-brand-600" viewBox="0 0 24 24" fill="none"><circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" /></svg>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Votre paiement est en cours de validation… La page se met à jour automatiquement.
              </p>
            </div>
          )}

          <p className="mt-6 text-xs text-slate-400">Référence : {order.reference}</p>
          <ConfirmationPoll orderId={order.id} />
        </div>
      </main>
    );
  }

  if (order.status !== OrderStatus.PAID || order.tickets.length === 0) notFound();

  const quantity = Math.max(1, order.quantity || 1);
  const unitPrice = order.amount / quantity;
  // Prix tout compris payé par le client (frais de service non détaillés).
  const totalPaid = clientTotal(order);
  const deliveryLabel =
    order.deliveryMethod === DeliveryMethod.EMAIL
      ? "Par email"
      : order.deliveryMethod === DeliveryMethod.WHATSAPP
        ? "Sur WhatsApp"
        : "Téléchargement";
  const ticketsWithQr = await Promise.all(
    order.tickets.map(async (t) => ({
      ...t,
      qr: await ticketQrDataUrl(t),
    }))
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-emerald-50 via-slate-50 to-slate-100 pb-16 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="mx-auto max-w-3xl px-4 pt-10 sm:px-6">
        {/* Succès */}
        <div className="animate-fade-up text-center">
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/30">
            <svg className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Paiement confirmé</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Merci {order.customerName.split(" ")[0]} ! {quantity > 1 ? `Vos ${quantity} billets ont été émis.` : "Votre billet a été émis."}
          </p>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Facture */}
          <div className="animate-fade-up h-fit rounded-3xl bg-white p-6 shadow-xl dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold text-slate-900 dark:text-white">Facture</h2>
              <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{order.reference}</span>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-400">Événement</dt>
                <dd className="max-w-[55%] text-right font-semibold text-slate-800 dark:text-slate-200">{order.event.name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Date</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200">
                  {order.event.date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Billet</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200">
                  {order.category?.name ?? "Standard"} × {quantity}
                </dd>
              </div>
              {quantity > 1 && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Prix unitaire</dt>
                  <dd className="font-semibold text-slate-800 dark:text-slate-200">{formatFcfa(unitPrice)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-400">Client</dt>
                <dd className="max-w-[55%] text-right font-semibold text-slate-800 dark:text-slate-200">{order.customerName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">Téléphone</dt>
                <dd className="font-semibold text-slate-800 dark:text-slate-200">{displayPhone(order.customerPhone)}</dd>
              </div>
              {order.customerEmail && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Email</dt>
                  <dd className="max-w-[55%] truncate text-right font-semibold text-slate-800 dark:text-slate-200">{order.customerEmail}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-slate-400">Paiement</dt>
                <dd className="max-w-[60%] text-right font-semibold text-emerald-600 dark:text-emerald-400">
                  {paymentMethodLabel(order.paymentMethod)} ✓
                </dd>
              </div>
              {order.deliveryMethod && (
                <div className="flex justify-between">
                  <dt className="text-slate-400">Réception du billet</dt>
                  <dd className="text-right font-semibold text-slate-800 dark:text-slate-200">{deliveryLabel}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-dashed border-slate-200 pt-3 dark:border-slate-700">
                <dt className="font-bold text-slate-900 dark:text-white">Total payé</dt>
                <dd className="text-lg font-extrabold text-brand-600 dark:text-brand-400">{formatFcfa(totalPaid)}</dd>
              </div>
            </dl>
          </div>

          {/* Billets */}
          <div className="animate-fade-up space-y-4">
            {ticketsWithQr.map((ticket, i) => (
              <div key={ticket.id} className="overflow-hidden rounded-3xl bg-white shadow-xl dark:bg-slate-900">
                <div className="bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-4 text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-widest text-brand-200">
                        {order.category?.name ?? "Billet"} {quantity > 1 ? `· ${i + 1}/${quantity}` : ""}
                      </p>
                      <p className="mt-0.5 text-base font-extrabold leading-tight">{order.event.name}</p>
                    </div>
                    <div className="rounded-xl bg-slate-950 p-1.5">
                      <Logo height={22} />
                    </div>
                  </div>
                </div>
                <div className="p-6 text-center">
                  {ticket.qr && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ticket.qr} alt={`QR code du billet ${i + 1}`} className="mx-auto h-40 w-40 rounded-xl bg-slate-50 p-2 dark:bg-slate-100" />
                  )}
                  <p className="mt-2 font-mono text-[11px] text-slate-400">{ticket.code}</p>
                  <p className="mt-3 text-sm font-bold text-slate-900 dark:text-white">{ticket.guestName}</p>
                  <p className="text-xs text-slate-400">Présentez ce QR à l&apos;entrée</p>

                  <WhatsAppBilletButton
                    orderId={order.id}
                    phone={order.customerPhone}
                    reference={ticketRef(order.reference)}
                    eventName={order.event.name}
                    guestName={ticket.guestName}
                  />

                  <a
                    href={`/t/${ticket.code}`}
                    className="mt-2 block text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Voir le billet plein écran
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Réception du billet */}
        <div className="animate-fade-up mt-6 overflow-hidden rounded-3xl bg-white shadow-xl dark:bg-slate-900">
          <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <svg className="h-5 w-5 text-brand-600 dark:text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" /></svg>
              Réception de votre billet
            </h2>
          </div>
          <div className="p-6">
            <WhatsAppBilletButton
              orderId={order.id}
              phone={order.customerPhone}
              reference={ticketRef(order.reference)}
              eventName={order.event.name}
              guestName={order.customerName}
              fullWidth
            />
            {order.deliveryMethod === DeliveryMethod.EMAIL && order.customerEmail && (
              <p className="mt-3 text-center text-xs text-slate-400">
                Votre billet a aussi été envoyé à <b>{order.customerEmail}</b>.
              </p>
            )}
          </div>
        </div>

        {/* Aide : retrouver le billet plus tard */}
        <div className="animate-fade-up mt-6 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-center text-sm dark:border-brand-900 dark:bg-brand-950/40">
          <p className="flex items-center justify-center gap-2 font-semibold text-brand-700 dark:text-brand-300">
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z" /></svg>
            Perdu ? Retrouvez vos billets à tout moment sur{" "}
            <a href="/mon-billet" className="underline hover:no-underline">/mon-billet</a> avec votre numéro de téléphone.
          </p>
        </div>

        {/* Pied de page */}
        <div className="mt-10 text-center">
          <p className="text-xs text-slate-400">
            Propulsé par <span className="font-bold text-slate-500 dark:text-slate-400">Sigma Events</span> — Bénin
          </p>
          <p className="mt-1 text-[11px] text-slate-300 dark:text-slate-600">
            Lien de vente : {purchaseUrl(order.event.salesSlug ?? "")}
          </p>
        </div>
      </div>
    </main>
  );
}
