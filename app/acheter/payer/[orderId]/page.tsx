import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OrderStatus } from "@/app/generated/prisma/enums";
import Logo from "@/components/logo";
import PayForm from "@/components/pay-form";
import { formatFcfa, displayPhone } from "@/lib/format";
import { clientTotal } from "@/lib/shop";

export const metadata = {
  title: "Paiement",
};

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { orderId } = await params;
  const { err } = await searchParams;
  const paymentError = err === "PAYMENT_UNAVAILABLE";
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
          <Logo height={40} className="rounded-xl bg-slate-950 p-1.5" />
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
              <PayForm orderId={order.id} phone={order.customerPhone} />
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
