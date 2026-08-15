import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EventMode } from "@/app/generated/prisma/enums";
import Logo from "@/components/logo";
import CoverImage from "@/components/cover-image";
import BuyTicketForm from "@/components/buy-ticket-form";
import { formatFcfa } from "@/lib/format";
import { isSalesOpen } from "@/lib/shop";

export const metadata = {
  title: "Acheter un billet",
};

export default async function BuyPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { slug } = await params;
  const { err } = await searchParams;

  const event = await prisma.event.findUnique({
    where: { salesSlug: slug },
    include: {
      categories: { orderBy: { price: "asc" } },
      tickets: { select: { categoryId: true } },
    },
  });
  if (!event) notFound();

  // Ventes fermées : l'organisateur a fermé la vente, l'événement est terminé, ou la
  // vente à la porte est désactivée (boutique fermée dès le début de l'événement).
  const salesClosed = !isSalesOpen(event);
  const isDraft = event.status === "DRAFT";
  // Mode « invitations privées » : pas de vente en ligne, l'accès se fait par invitation.
  const inviteOnly = event.mode === EventMode.INVITE;
  const soldOut = (() => {
    const sold = event.tickets.length;
    return sold >= event.capacity;
  })();

  const soldByCategory = new Map<string, number>();
  for (const t of event.tickets) {
    if (t.categoryId) soldByCategory.set(t.categoryId, (soldByCategory.get(t.categoryId) ?? 0) + 1);
  }
  const categories = event.categories.map((c) => ({
    id: c.id,
    name: c.name,
    price: c.price,
    capacity: c.capacity,
    sold: soldByCategory.get(c.id) ?? 0,
  }));

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-50 to-slate-200 pb-16 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Bandeau supérieur */}
      <div className="border-b border-slate-200/60 bg-white/70 backdrop-blur dark:border-slate-800 dark:bg-slate-950/70">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4 sm:px-6">
          <Logo height={32} />
          <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Billetterie officielle</span>
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-brand-100 px-3 py-1 text-[11px] font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            Sécurisé
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 pt-8 sm:px-6">
        {/* Carte événement */}
        <div className="animate-fade-up overflow-hidden rounded-3xl bg-white shadow-xl dark:bg-slate-900">
          {/* Image de couverture (fond dégradé de secours si l'URL ne charge pas) */}
          {event.imageUrl && (
            <div className="relative h-52 w-full overflow-hidden bg-gradient-to-br from-brand-700 via-brand-800 to-slate-900 sm:h-64">
              <CoverImage src={event.imageUrl} alt={event.name} />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            </div>
          )}
          <div className="bg-gradient-to-br from-brand-700 via-brand-800 to-slate-900 px-6 py-8 text-white sm:px-8">
            <div className="absolute right-5 top-5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold uppercase tracking-widest backdrop-blur">
              {event.type ?? "Événement"}
            </div>
            <h1 className="max-w-lg text-2xl font-extrabold leading-tight sm:text-3xl">{event.name}</h1>
            <div className="mt-4 space-y-1.5 text-sm text-brand-100">
              <p className="flex items-center gap-2">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                {event.location}
              </p>
              <p className="flex items-center gap-2">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                {event.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                {" · "}
                {event.date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </p>
              {event.doorsOpen && (
                <p className="flex items-center gap-2">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></svg>
                  Portes ouvertes à {event.doorsOpen}
                </p>
              )}
            </div>
          </div>

          <div className="p-6 sm:p-8">
            {event.description && (
              <p className="mb-5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{event.description}</p>
            )}
            <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">
              {inviteOnly ? "Événement sur invitation" : "Réservez votre place"}
            </h2>
            {inviteOnly ? (
              <div className="animate-fade-up rounded-2xl border border-brand-200 bg-brand-50 p-6 text-center dark:border-brand-900 dark:bg-brand-950/40">
                <svg className="mx-auto h-10 w-10 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M9 5v2M9 17v2" /></svg>
                <p className="mt-2 text-base font-bold text-slate-800 dark:text-slate-200">Accès par invitation uniquement</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                  Cet événement n&apos;est pas en vente libre : les places sont réservées aux invités.
                  Si vous avez reçu une invitation, ouvrez le lien qui vous a été envoyé.
                </p>
                <Link
                  href="/"
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5"
                >
                  Retour à l&apos;accueil
                </Link>
              </div>
            ) : isDraft ? (
              <div className="animate-fade-up rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-800/50">
                <svg className="mx-auto h-10 w-10 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M13 5v2M13 17v2M13 11v2" /></svg>
                <p className="mt-2 text-base font-bold text-slate-800 dark:text-slate-200">Billetterie à venir</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
                  Les billets ne sont pas encore en vente. Revenez bientôt !
                </p>
              </div>
            ) : salesClosed ? (
              <div className="animate-fade-up rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-950/40">
                <svg className="mx-auto h-10 w-10 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                <p className="mt-2 text-base font-bold text-amber-800 dark:text-amber-300">Ventes fermées</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-amber-700/80 dark:text-amber-400/80">
                  {soldOut
                    ? "Tous les billets sont vendus."
                    : "Cet événement est terminé ou les ventes en ligne ont été fermées par l'organisateur."}
                </p>
              </div>
            ) : (
              <BuyTicketForm eventId={event.id} categories={categories} error={err} maxPerCustomer={event.maxPerCustomer ?? 10} />
            )}

            {!isDraft && !salesClosed && event.contactName && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/50">
                <p className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                  <svg className="h-4 w-4 text-brand-600 dark:text-brand-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  Une question ?
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Contactez <b>{event.contactName}</b>
                  {event.contactPhone && (
                    <>
                      {" "}·{" "}
                      <a
                        href={`https://wa.me/229${event.contactPhone.replace(/\D/g, "").replace(/^229/, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-brand-600 hover:underline dark:text-brand-400"
                      >
                        WhatsApp +229 {event.contactPhone.replace(/\D/g, "")}
                      </a>
                    </>
                  )}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Aide */}
        <div className="mt-6 grid grid-cols-1 gap-3 text-xs text-slate-500 dark:text-slate-400 sm:grid-cols-3">
          <div className="flex items-start gap-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M13 5v2M13 17v2M13 11v2" /></svg>
            <p>Billet QR envoyé sur WhatsApp juste après le paiement.</p>
          </div>
          <div className="flex items-start gap-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>
            <p>Facture reçue par email et affichée à l&apos;écran.</p>
          </div>
          <div className="flex items-start gap-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            <p>Présentez votre QR à l&apos;entrée, les agents le scannent.</p>
          </div>
        </div>

        {categories[0] && (
          <p className="mt-6 text-center text-xs text-slate-400">
            Billets à partir de <b>{formatFcfa(categories[0].price)}</b> · Propulsé par{" "}
            <span className="font-bold text-slate-500 dark:text-slate-400">Sigma Security</span> — Bénin
          </p>
        )}
        <p className="mt-3 text-center">
          <Link href="/mon-billet" className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M9 5v2M9 17v2" /></svg>
            Vous avez déjà acheté ? Retrouvez votre billet
          </Link>
        </p>
      </div>
    </main>
  );
}
