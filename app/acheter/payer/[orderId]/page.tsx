import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/app/generated/prisma/enums";
import Logo from "@/components/logo";
import PayForm from "@/components/pay-form";
import KkiapayWidget from "@/components/kkiapay-widget";
import { formatFcfa, displayPhone } from "@/lib/format";
import { isKkiapayEnabled, isKkiapaySandbox, kkiapayConfig, kkiapayAmount } from "@/lib/kkiapay";
import { finalizeOrderTestAction } from "@/app/actions";
import { clientTotal } from "@/lib/shop";

export const metadata = {
  title: "Paiement",
};

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ err?: string; kkiapay?: string }>;
}) {
  const { orderId } = await params;
  const { err, kkiapay } = await searchParams;
  const paymentError = err === "PAYMENT_UNAVAILABLE";
  // Mode widget KKIAPAY : simulatePaymentAction a enregistré la livraison puis
  // redirigé ici avec ?kkiapay=1 — le widget client ouvre openKkiapayWidget.
  const kkiapayMode = kkiapay === "1" && isKkiapayEnabled();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { event: true, category: true },
  });
  if (!order) notFound();

  // Commande déjà payée → confirmation directe
  if (order.status === OrderStatus.PAID) {
    redirect(`/acheter/confirmation/${order.id}`);
  }

  // Commande annulée (expirée : 20 min sans paiement, ou annulée par l'organisateur)
  const cancelled = order.status === OrderStatus.CANCELLED;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4 dark:from-slate-950 dark:to-slate-900">
      <div className="animate-fade-up w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo height={40} />
        </div>

        {cancelled ? (
          <div className="overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="bg-gradient-to-br from-red-500 to-red-700 px-6 py-6 text-center text-white">
              <p className="text-xs font-bold uppercase tracking-widest text-red-200">Commande expirée</p>
              <svg className="mx-auto mt-2 h-10 w-10 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
              <p className="mt-1 text-sm text-red-100">{order.event.name}</p>
            </div>
            <div className="p-6 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Cette commande a été annulée car elle n&apos;a pas été payée à temps, ou l&apos;organisateur l&apos;a libérée.
                Les places sont redevenues disponibles.
              </p>
              {order.event.salesSlug && (
                <a
                  href={`/acheter/${order.event.salesSlug}`}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 hover:bg-brand-700"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                  Recommencer mon achat
                </a>
              )}
              <p className="mt-4 text-xs text-slate-400">Référence : {order.reference}</p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="bg-gradient-to-br from-brand-600 to-brand-800 px-6 py-6 text-center text-white">
              <p className="text-xs font-bold uppercase tracking-widest text-brand-200">Paiement sécurisé</p>
              <p className="mt-2 text-3xl font-extrabold">{formatFcfa(clientTotal(order))}</p>
              <p className="mt-1 text-sm text-brand-100">
                {order.event.name} · {order.category?.name}
              </p>
              <p className="mt-1 text-[11px] text-brand-200">
                Billets {order.category?.name} × {order.quantity}
              </p>
            </div>

            <div className="p-6">
              {paymentError && (
                <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                  Le paiement en ligne est temporairement indisponible. Réessayez dans quelques instants.
                </div>
              )}
              <p className="mb-2 text-xs font-semibold text-slate-400">
                Paiement sur le {displayPhone(order.customerPhone)} · MTN MoMo · Moov Money · Celtiis Cash
              </p>
              {kkiapayMode ? (
                <div className="rounded-2xl border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950/40">
                  <div className="mb-3 flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Total à payer</span>
                    <span className="text-xl font-extrabold text-brand-600 dark:text-brand-400">
                      {formatFcfa(kkiapayAmount(order))}
                    </span>
                  </div>
                  <KkiapayWidget
                    amount={kkiapayAmount(order)}
                    publicKey={kkiapayConfig().publicKey}
                    sandbox={kkiapayConfig().sandbox}
                    phone={order.customerPhone}
                    name={order.customerName}
                    email={order.customerEmail}
                    callback={`${process.env.APP_URL || "http://localhost:3000"}/acheter/confirmation/${order.id}`}
                    partnerId={order.reference}
                    data={JSON.stringify({ orderId: order.id })}
                  />
                  <a
                    href={`/acheter/payer/${order.id}`}
                    className="mt-3 block text-center text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
                  >
                    ← Modifier la réception
                  </a>
                  {/* Finalisation de secours — phase de test uniquement (sandbox KKIA).
                      À retirer au passage en production. */}
                  {isKkiapaySandbox() && (
                    <form action={finalizeOrderTestAction} className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 text-center dark:border-slate-700 dark:bg-slate-900/60">
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="delivery" value={order.deliveryMethod ?? "WHATSAPP"} />
                      <p className="text-[11px] text-slate-400">
                        La fenêtre de paiement ne s&apos;ouvre pas ou le test est bloqué ?
                      </p>
                      <button
                        type="submit"
                        className="mt-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
                      >
                        Finaliser en mode test
                      </button>
                    </form>
                  )}
                </div>
              ) : (
                <PayForm orderId={order.id} phone={order.customerPhone} />
              )}
              <p className="mt-3 text-center text-[11px] text-slate-400">
                Votre commande expire dans <b>20 minutes</b> si le paiement n&apos;est pas validé.
              </p>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
