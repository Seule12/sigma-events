import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OrderStatus, DeliveryMethod } from "@/app/generated/prisma/enums";
import Logo from "@/components/logo";
import ConfirmationPoll from "@/components/confirmation-poll";
import { formatFcfa } from "@/lib/format";
import { purchaseUrl, clientTotal } from "@/lib/shop";
import { ticketQrDataUrl, whatsappTicketLink } from "@/lib/qr";
import { paymentMethodLabel } from "@/lib/momo";

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
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4 dark:from-slate-950 dark:to-slate-900">
        <div className="animate-fade-up w-full max-w-md text-center">
          <div className="mx-auto mb-6 grid h-16 w-16 place-items-center">
            <svg className="h-10 w-10 animate-spin text-brand-600" viewBox="0 0 24 24" fill="none"><circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" /><path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" /></svg>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">Confirmation du paiement</h1>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Votre paiement est en cours de validation… La page se met à jour automatiquement.
          </p>
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
      whatsapp: whatsappTicketLink(t.guestPhone, order.event.name, t.guestName, t.code),
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
                <dd className="font-semibold text-slate-800 dark:text-slate-200">+229 {order.customerPhone}</dd>
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
                    <div className="rounded-xl bg-white p-1.5">
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

                  {ticket.whatsapp && (
                    <a
                      href={ticket.whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] py-3 text-sm font-bold text-white transition hover:brightness-95"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                      Envoyer ce billet sur WhatsApp
                    </a>
                  )}

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

        {/* Mode de livraison choisi */}
        <div className="animate-fade-up mt-6 overflow-hidden rounded-3xl bg-white shadow-xl dark:bg-slate-900">
          <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
              <svg className="h-5 w-5 text-brand-600 dark:text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" /></svg>
              Réception de votre billet
            </h2>
          </div>
          <div className="p-6">
            {order.deliveryMethod === DeliveryMethod.WHATSAPP ? (
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Votre billet part sur <b>WhatsApp</b> au <b>+229 {order.customerPhone}</b>. Envoyez-le dès maintenant :
                </p>
                <a
                  href={ticketsWithQr[0]?.whatsapp ?? "#"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-[#25D366] py-3.5 text-sm font-bold text-white shadow-lg shadow-green-600/20 transition hover:-translate-y-0.5 hover:brightness-95"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                  Envoyer sur WhatsApp
                </a>
              </div>
            ) : order.deliveryMethod === DeliveryMethod.EMAIL ? (
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Votre billet a été envoyé à <b>{order.customerEmail || "votre adresse email"}</b>. Vous y trouverez le lien « Voir mon billet ».
                </p>
                <p className="mt-2 text-xs text-slate-400">Pas reçu ? Vérifiez vos courriers indésirables ou utilisez la recherche par téléphone.</p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Votre billet est prêt : il s&apos;affiche ci-dessus avec son QR code. Vous pouvez aussi le retrouver à tout moment sur /mon-billet.
                </p>
              </div>
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
            Propulsé par <span className="font-bold text-slate-500 dark:text-slate-400">Sigma Security</span> — Bénin
          </p>
          <p className="mt-1 text-[11px] text-slate-300 dark:text-slate-600">
            Lien de vente : {purchaseUrl(order.event.salesSlug ?? "")}
          </p>
        </div>
      </div>
    </main>
  );
}
