import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Role } from "@/app/generated/prisma/enums";
import Sidebar from "@/components/sidebar";
import CreateEventForm from "@/components/create-event-form";

export default async function CreateEventPage() {
  const user = await requireUser(Role.ORGANIZER);
  // Liste les événements de l'organisateur pour la sidebar (comme sur les autres pages).
  const events = await prisma.event.findMany({
    where: { organizerId: user.id },
    select: { id: true, name: true },
    orderBy: { date: "desc" },
  });
  const sidebarEvents = events.map((e) => ({ id: e.id, name: e.name }));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <Sidebar events={sidebarEvents} userName={user.name} isPro={user.profileType === "PRO"} />
      <div className="lg:pl-[var(--sidebar-w)]">
        <main className="mx-auto max-w-4xl px-4 py-10 pt-24 sm:px-6 lg:pt-12">
          <div className="mb-8">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              Retour au tableau de bord
            </Link>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Créer un nouvel événement
            </h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Configurez les détails de votre événement et générez votre lien de vente.
            </p>
          </div>

          <CreateEventForm />
        </main>
      </div>
    </div>
  );
}
