import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OrderStatus, Role, TicketStatus, CheckInStatus, InvitationStatus, EventMode, TerminalStatus } from "@/app/generated/prisma/enums";
import Sidebar from "@/components/sidebar";
import CopyLink from "@/components/copy-link";
import RevealConsumer from "@/components/reveal-consumer";
import InviteBulkSend, { type BulkInviteItem } from "@/components/invite-bulk-send";
import { addAgentAction, addGuestAction, blacklistTicketAction, cancelPendingOrderAction, createTerminalAction, generateSalesSlugAction, importGuestsAction, regenerateTerminalCodeAction, removeAgentAction, resetAgentPinAction, setInviteStatusAction, setTerminalStatusAction, setTerminalZoneAction, toggleEntranceBlockedAction, toggleEventStatusAction, toggleSalesAction, updateGuestAction } from "@/app/actions";
import { ticketQrContent, whatsappInviteLink, emailInviteLink, smsInviteLink } from "@/lib/qr";
import LazyQr from "@/components/lazy-qr";
import { formatFcfa, displayPhone } from "@/lib/format";
import { purchaseUrl, ORDER_EXPIRY_MS, expireStalePendingOrders } from "@/lib/shop";

function initials(name: string) {
  return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function secondsSince(date: Date) {
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
}

export default async function EventDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    imported?: string;
    importErr?: string;
    agentAssigned?: string;
    agentErr?: string;
    agentCreated?: string;
    agentReset?: string;
    terminalCreated?: string;
    terminalRegenerated?: string;
    sales?: string;
    draft?: string;
    salesLink?: string;
    dupGuest?: string;
    edited?: string;
    editErr?: string;
    blocked?: string;
  }>;
}) {
  const user = await requireUser(Role.ORGANIZER);
  const { id } = await params;
  const sp = await searchParams;

  const event = await prisma.event.findFirst({
    where: { id, organizerId: user.id },
    include: {
      categories: true,
      tickets: { include: { category: true, _count: { select: { checkIns: true } } }, orderBy: { createdAt: "desc" } },
      capacityAlerts: { orderBy: { threshold: "asc" } },
      agents: { include: { agent: true } },
      terminals: { include: { agent: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!event) notFound();

  // Zones d'accès de l'événement (accréditations) : liste dédupliquée, utilisée
  // par les sélecteurs de zone des portes. Par défaut, un socle générique.
  const zoneList = event.zones
    ? [...new Set(event.zones.split(",").map((z) => z.trim().toLowerCase()).filter(Boolean))]
    : ["main", "vip", "backstage", "parking"];

  // Événements de l'organisateur (sidebar)
  const sidebarEvents = (
    await prisma.event.findMany({
      where: { organizerId: user.id },
      select: { id: true, name: true },
      orderBy: { date: "desc" },
    })
  ).map((e) => ({ id: e.id, name: e.name }));

  // Entrées comptées en personnes : chaque check-in VALID ou ENTRY = 1 personne entrée.
  const enteredPeople = await prisma.checkIn.count({
    where: { eventId: event.id, status: { in: [CheckInStatus.VALID, CheckInStatus.ENTRY] } },
  });
  const entered = enteredPeople;
  const pct = event.capacity > 0 ? Math.min(100, Math.round((entered / event.capacity) * 100)) : 0;
  const totalCheckIns = event.tickets.reduce((s, t) => s + t._count.checkIns, 0);
  const duplicates = event.tickets.reduce((s, t) => s + Math.max(0, t._count.checkIns - 1), 0);

  // Cycle de vie des invitations : compteurs par statut (CRÉÉ → GÉNÉRÉ → ENVOYÉ → OUVERT → CONFIRMÉ → ENTRÉ).
  const inviteStats = {
    [InvitationStatus.CREATED]: 0,
    [InvitationStatus.GENERATED]: 0,
    [InvitationStatus.SENT]: 0,
    [InvitationStatus.OPENED]: 0,
    [InvitationStatus.CONFIRMED]: 0,
    [InvitationStatus.ENTERED]: 0,
    [InvitationStatus.CANCELLED]: 0,
  };
  for (const t of event.tickets) {
    inviteStats[t.inviteStatus] = (inviteStats[t.inviteStatus] ?? 0) + 1;
  }
  const inviteSummary = [
    { key: InvitationStatus.CREATED, label: "Créées", count: inviteStats[InvitationStatus.CREATED] },
    { key: InvitationStatus.GENERATED, label: "Générées", count: inviteStats[InvitationStatus.GENERATED] },
    { key: InvitationStatus.SENT, label: "Envoyées", count: inviteStats[InvitationStatus.SENT] },
    { key: InvitationStatus.OPENED, label: "Ouvertes", count: inviteStats[InvitationStatus.OPENED] },
    { key: InvitationStatus.CONFIRMED, label: "Confirmées", count: inviteStats[InvitationStatus.CONFIRMED] },
    { key: InvitationStatus.ENTERED, label: "Entrées", count: inviteStats[InvitationStatus.ENTERED] },
  ];
  const modeLabel =
    event.mode === EventMode.INVITE
      ? "Invitations privées"
      : event.mode === EventMode.COMBINED
        ? "Billetterie + invitations"
        : "Billetterie publique";

  // QR codes générés côté client (<LazyQr />) : le serveur n'encode plus 50 QR à
  // chaque chargement (opération CPU lourde) — la page se rend instantanément et
  // chaque QR apparaît à la volée quand sa carte approche de la zone visible.
  const visibleTickets = event.tickets.slice(0, 50);

  // Agents assignés + activité (scans validés par agent). Une seule requête
  // GROUP BY au lieu d'un COUNT par agent (fini le N+1 sur les gros événements).
  const agentIds = event.agents.map((ea) => ea.agentId);
  const agentScans = agentIds.length
    ? await prisma.checkIn.groupBy({
        by: ["agentId"],
        where: {
          eventId: event.id,
          agentId: { in: agentIds },
          status: { in: [CheckInStatus.VALID, CheckInStatus.ENTRY] },
        },
        _count: { _all: true },
      })
    : [];
  const scansByAgent = new Map(agentScans.map((r) => [r.agentId, r._count._all]));
  const agentRows = event.agents.map((ea) => ({
    id: ea.id,
    agentId: ea.agentId,
    name: ea.agent.name,
    phone: ea.agent.phone,
    scans: scansByAgent.get(ea.agentId) ?? 0,
  }));

  // Ventes en ligne
  const onlineOrders = await prisma.order.findMany({
    where: { eventId: event.id, status: OrderStatus.PAID },
    include: { category: true },
    orderBy: { createdAt: "desc" },
  });
  const onlineRevenue = onlineOrders.reduce((s, o) => s + o.amount, 0);

  // Réservations en attente de paiement (places bloquées, expirent après 20 min).
  // Le sweep libère d'abord les commandes abandonnées pour n'afficher que les vraies.
  await expireStalePendingOrders();
  const pendingOrders = await prisma.order.findMany({
    where: { eventId: event.id, status: OrderStatus.PENDING },
    include: { category: true },
    orderBy: { createdAt: "desc" },
  });
  const pendingSeats = pendingOrders.reduce((s, o) => s + o.quantity, 0);

  const salesUrl = event.salesSlug ? purchaseUrl(event.salesSlug) : null;
  // Invitations prêtes pour l'envoi groupé (ni entrées, ni annulées).
  const bulkInvites: BulkInviteItem[] = event.tickets
    .filter((t) => t.inviteStatus !== InvitationStatus.ENTERED && t.inviteStatus !== InvitationStatus.CANCELLED)
    .map((t) => ({
      id: t.id,
      guestName: t.guestName,
      guestPhone: t.guestPhone,
      guestEmail: t.guestEmail,
      guestCount: t.guestCount,
    }));
  const salesCreated = sp.sales === "1";
  const draftCreated = sp.draft === "1";
  const salesLinkCreated = sp.salesLink === "1";
  const dupGuest = sp.dupGuest === "1";

  const imported = sp.imported ? parseInt(sp.imported, 10) : null;
  const importErr = sp.importErr ? parseInt(sp.importErr, 10) : null;
  const agentAssigned = sp.agentAssigned === "1";
  const agentErr = sp.agentErr ? parseInt(sp.agentErr, 10) : null;
  // Flags de redirection (aucun secret dans l'URL) : servent à varier le texte du
  // bandeau selon l'action effectuée (création vs réinitialisation du PIN…).
  const agentCreated = sp.agentCreated === "1";
  const agentReset = sp.agentReset === "1";
  const terminalCreated = sp.terminalCreated === "1";
  const terminalRegenerated = sp.terminalRegenerated === "1";
  const edited = sp.edited === "1";
  const expiryMinutes = Math.round(ORDER_EXPIRY_MS / 60_000);
  const editErr = sp.editErr ? parseInt(sp.editErr, 10) : null;
  const salesOpen = event.salesOpen !== false;

  // SIGMA Scanner : code d'activation du terminal affiché une seule fois + urgence.
  // Le secret (PIN agent / code terminal) est lu depuis le cookie éphémère posé
  // par l'action — jamais depuis l'URL (historique, logs serveur). Le composant
  // <RevealConsumer /> efface le cookie après l'affichage : un rechargement ne
  // réaffiche jamais le secret.
  const revealRaw = (await cookies()).get("sigma_reveal")?.value ?? null;
  let reveal: { kind: "agentPin" | "terminalPin"; secret: string; name: string } | null = null;
  if (revealRaw) {
    try {
      const parsed = JSON.parse(revealRaw) as { kind?: string; secret?: string; name?: string };
      if (
        parsed &&
        (parsed.kind === "agentPin" || parsed.kind === "terminalPin") &&
        typeof parsed.secret === "string" &&
        typeof parsed.name === "string"
      ) {
        reveal = { kind: parsed.kind, secret: parsed.secret, name: parsed.name };
      }
    } catch {
      // Cookie invalide : on n'affiche aucun secret.
    }
  }
  const entranceBlocked = event.entranceBlocked === true;
  const entranceBlockedNow = sp.blocked === "1";
  const entranceReopened = sp.blocked === "0";

  // Scans par terminal : un seul GROUP BY au lieu d'un COUNT par terminal.
  const terminalIds = event.terminals.map((t) => t.id);
  const terminalScans = terminalIds.length
    ? await prisma.checkIn.groupBy({
        by: ["terminalId"],
        where: {
          eventId: event.id,
          terminalId: { in: terminalIds },
          status: { in: [CheckInStatus.VALID, CheckInStatus.ENTRY] },
        },
        _count: { _all: true },
      })
    : [];
  const scansByTerminal = new Map(terminalScans.map((r) => [r.terminalId, r._count._all]));
  const terminalRows = event.terminals.map((t) => ({ ...t, scans: scansByTerminal.get(t.id) ?? 0 }));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <RevealConsumer />
      <Sidebar events={sidebarEvents} activeEventId={event.id} userName={user.name} />
      <div className="lg:pl-[var(--sidebar-w)]">
      <main className="mx-auto max-w-6xl px-4 py-8 pt-20 sm:px-6 lg:pt-8">
        {/* Bandeaux d'information */}
        {imported !== null && (
          <div className="animate-fade-up mb-6 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm font-semibold text-brand-700 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" /></svg>
            {imported} invité{imported > 1 ? "s" : ""} importé{imported > 1 ? "s" : ""} avec succès — billets QR générés.
          </div>
        )}
        {importErr !== null && (
          <div className="animate-fade-up mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            {importErr === 2
              ? "Fichier trop grand (2 Mo / 5 000 invités max)."
              : "Fichier illisible ou vide. Utilisez un CSV avec : nom ; téléphone ; catégorie."}
          </div>
        )}

        {/* Événement créé en brouillon */}
        {draftCreated && (
          <div className="animate-fade-up mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            Événement créé en <b>brouillon</b> — la boutique n&apos;est pas encore visible. Passez-le en « Annoncé » pour ouvrir les ventes.
          </div>
        )}

        {/* Lien de vente généré */}
        {salesLinkCreated && (
          <div className="animate-fade-up mb-6 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm font-semibold text-brand-700 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" /></svg>
            Lien d&apos;achat généré — partagez-le pour vendre les billets en ligne.
          </div>
        )}
        {/* Invité en doublon */}
        {dupGuest && (
          <div className="animate-fade-up mb-6 flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            Cet invité (nom + téléphone) a déjà un billet pour cet événement — doublon refusé.
          </div>
        )}

        {/* Bandeaux édition */}
        {edited && (
          <div className="animate-fade-up mb-6 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm font-semibold text-brand-700 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" /></svg>
            Événement mis à jour.
          </div>
        )}
        {editErr !== null && (
          <div className="animate-fade-up mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            {editErr === 2
              ? "La fin de l'événement doit être après le début."
              : "Vérifiez les informations (nom, lieu, date et capacité requis)."}
          </div>
        )}

        {/* Bandeaux agents (secret lu depuis le cookie éphémère, affiché une seule fois) */}
        {reveal?.kind === "agentPin" && (
          <div className="animate-fade-up mb-6 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm font-semibold text-brand-700 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300">
            <svg className="mt-0.5 h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" /></svg>
            <div>
              {agentReset
                ? `PIN réinitialisé pour l'agent « ${reveal.name} ».`
                : `Agent « ${reveal.name} » créé et assigné à cet événement.`}
              <span className="mt-1 block text-xs font-normal text-brand-600 dark:text-brand-400">
                PIN de connexion : <b className="font-mono text-base">{reveal.secret}</b> — transmettez-le par WhatsApp, il ne sera plus jamais affiché.
              </span>
            </div>
          </div>
        )}
        {agentAssigned && (
          <div className="animate-fade-up mb-6 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm font-semibold text-brand-700 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" /></svg>
            Agent déjà existant, assigné à cet événement (même PIN qu&apos;avant).
          </div>
        )}
        {agentErr !== null && (
          <div className="animate-fade-up mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
            {agentErr === 1
              ? "Ce numéro est déjà un compte organisateur — utilisez un autre numéro."
              : "Numéro invalide (8 chiffres minimum)."}
          </div>
        )}

        {/* En-tête événement — présentation hero */}
        <div className="relative mb-8 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {/* Image de couverture */}
          <div className="relative h-48 w-full overflow-hidden rounded-t-3xl">
            {event.imageUrl ? (
              <img 
                src={event.imageUrl} 
                alt={event.name} 
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-500/20 to-emerald-500/20 text-slate-400">
                <svg className="h-12 w-12 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
              </div>
            )}
          </div>
          {/* Fond : dégradé brand + grille décorative masquée */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-500/[0.07] via-transparent to-emerald-500/[0.06]" />
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgb(15 118 110 / 0.05) 1px, transparent 1px), linear-gradient(to bottom, rgb(15 118 110 / 0.05) 1px, transparent 1px)",
              backgroundSize: "30px 30px",
              maskImage: "radial-gradient(ellipse 85% 100% at 85% 0%, black 25%, transparent 78%)",
              WebkitMaskImage: "radial-gradient(ellipse 85% 100% at 85% 0%, black 25%, transparent 78%)",
            }}
          />

          <div className="relative flex flex-col gap-4 p-6 sm:p-8">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {event.status === "DRAFT" && (
                  <span className="flex items-center gap-1.5 rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> Brouillon
                  </span>
                )}
                {event.status === "DONE" && (
                  <span className="flex items-center gap-1.5 rounded-full bg-slate-300 px-3 py-1 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-slate-500" /> Terminé
                  </span>
                )}
                {event.status === "LIVE" && (pct >= 100 ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-700 dark:bg-red-950 dark:text-red-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> Complet
                  </span>
                ) : pct >= 80 ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> Presque complet
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Ouvert
                  </span>
                ))}
                <span className="rounded-full border border-slate-200 bg-white/70 px-3 py-1 text-xs font-bold text-slate-500 backdrop-blur dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300">
                  {modeLabel}
                </span>
              </div>
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
                {event.name}
              </h1>
              {event.description && (
                <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                  {event.description}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
                  {event.date.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="h-4 w-4 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                  {event.location}
                </span>
                {event.type && (
                  <span className="flex items-center gap-1.5">
                    <svg className="h-4 w-4 text-brand-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.83z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
                    {event.type}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
            <a
              href={`/api/events/${event.id}/export`}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
              CSV
            </a>
            <a
              href={`/events/${event.id}/rapport`}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
              Rapport
            </a>
            <a
              href={`/events/${event.id}/billets`}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" rx="1" /></svg>
              Imprimer
            </a>
            <a
              href={`/scan/${event.id}`}
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5 hover:shadow-xl"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />
              </svg>
              Scanner
            </a>
            {/* Cycle de vie : brouillon / annoncé / terminé */}
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                Statut
              </summary>
              <div className="absolute right-0 z-20 mt-2 flex w-56 flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                {(["DRAFT", "LIVE", "DONE"] as const).map((s) => (
                  <form key={s} action={toggleEventStatusAction.bind(null, event.id, s)}>
                    <button
                      type="submit"
                      disabled={event.status === s}
                      className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold transition disabled:cursor-default ${
                        event.status === s
                          ? "bg-gradient-to-r from-brand-600 to-brand-700 text-white"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                      }`}
                    >
                      <span className="grid place-items-center">
                        {s === "DRAFT" ? (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" /></svg>
                        ) : s === "LIVE" ? (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
                        ) : (
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22v-7" /></svg>
                        )}
                      </span>
                      {s === "DRAFT" ? "Brouillon" : s === "LIVE" ? "Annoncé" : "Terminé"}
                    </button>
                  </form>
                ))}
                <p className="border-t border-slate-100 px-1 pt-2 text-[11px] leading-snug text-slate-400 dark:border-slate-700">
                  Brouillon : boutique cachée · Annoncé : ventes ouvertes · Terminé : ventes fermées.
                </p>
              </div>
            </details>
            <a
              href={`/events/${event.id}/edit`}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Modifier
            </a>
          </div>
        </div>

        {/* Bandeau de chiffres clés */}
        <div className="relative grid grid-cols-2 divide-x divide-y border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800 sm:grid-cols-4 sm:divide-y-0">
          <div className="bg-white/40 px-6 py-4 dark:bg-slate-900/40">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Capacité</p>
            <p className="mt-1 font-display text-xl font-extrabold text-slate-900 dark:text-white">
              {event.capacity} <span className="text-sm font-bold text-slate-400">places</span>
            </p>
          </div>
          <div className="bg-white/40 px-6 py-4 dark:bg-slate-900/40">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Entrées</p>
            <p className="mt-1 font-display text-xl font-extrabold text-slate-900 dark:text-white">
              {entered} <span className="text-sm font-bold text-slate-400">· {pct} %</span>
            </p>
          </div>
          <div className="bg-white/40 px-6 py-4 dark:bg-slate-900/40">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Ventes en ligne</p>
            <p className="mt-1 font-display text-xl font-extrabold text-brand-600 dark:text-brand-400">
              {onlineOrders.length} <span className="text-sm font-bold text-slate-400">· {formatFcfa(onlineRevenue)}</span>
            </p>
          </div>
          <div className="bg-white/40 px-6 py-4 dark:bg-slate-900/40">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">En attente</p>
            <p className="mt-1 font-display text-xl font-extrabold text-amber-500">
              {pendingSeats} <span className="text-sm font-bold text-slate-400">places</span>
            </p>
          </div>
        </div>
      </div>

        {/* Alertes de jauge (80 / 90 / 100 %) */}
        {event.capacityAlerts.length > 0 && (
          <div className="animate-fade-up mb-6 space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-400">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
              Alertes de jauge
            </h3>
            {event.capacityAlerts.map((a) => (
              <div
                key={a.id}
                className={`flex items-center gap-3 rounded-2xl border px-5 py-3 text-sm font-semibold ${
                  a.threshold === 100
                    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                    : a.threshold === 90
                      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
                      : "border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300"
                }`}
              >
                <span className="shrink-0">
                  {a.threshold === 100 ? (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
                  ) : a.threshold === 90 ? (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
                  ) : (
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                  )}
                </span>
                <span>
                  Jauge à {a.threshold} % atteinte
                  <span className="ml-2 font-normal opacity-70">
                    ({a.triggeredAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })})
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Jauge */}
        <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-brand-500/10 blur-2xl" />
            <div className="relative mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">Affluence</p>
                <h2 className="mt-0.5 font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">Jauge de capacité</h2>
              </div>
              <span className="flex items-baseline gap-1 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-2 dark:border-slate-800 dark:bg-slate-800">
                <span className="font-display text-2xl font-extrabold text-slate-900 dark:text-white">{entered}</span>
                <span className="text-sm font-semibold text-slate-400">/ {event.capacity} entrées</span>
              </span>
            </div>
            <div className="relative h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className={`h-full rounded-full transition-all duration-700 ${pct >= 100 ? "bg-gradient-to-r from-red-500 to-red-600" : pct >= 80 ? "bg-gradient-to-r from-amber-500 to-amber-600" : "bg-gradient-to-r from-brand-500 to-brand-700"}`}
                style={{ width: `${pct}%` }}
              />
              {/* Reflet doux sur la barre */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/40 to-transparent opacity-60" />
            </div>
            <div className="mt-2 flex justify-between text-xs font-semibold text-slate-400 dark:text-slate-500">
              <span>0</span>
              <span className={pct >= 80 ? "font-bold text-amber-600 dark:text-amber-400" : ""}>80 %</span>
              <span className={pct >= 90 ? "font-bold text-amber-600 dark:text-amber-400" : ""}>90 %</span>
              <span className={pct >= 100 ? "font-bold text-red-600 dark:text-red-400" : ""}>Capacité : {event.capacity}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="group rounded-3xl border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900" style={{ borderTop: "3px solid #00e676" }}>
              <p className="font-display text-3xl font-extrabold" style={{ color: "#00e676" }}>{pct}%</p>
              <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Jauge</p>
            </div>
            <div className="group rounded-3xl border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900" style={{ borderTop: "3px solid #60a5fa" }}>
              <p className="font-display text-3xl font-extrabold" style={{ color: "#60a5fa" }}>{totalCheckIns}</p>
              <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Scans</p>
            </div>
            <div className="group rounded-3xl border border-slate-200 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900" style={{ borderTop: "3px solid #f59e0b" }}>
              <p className="font-display text-3xl font-extrabold" style={{ color: "#f59e0b" }}>{duplicates}</p>
              <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Dupliqués</p>
            </div>
          </div>
        </div>

        {/* Vente en ligne */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>
              </span>
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">Billetterie</p>
                <h2 className="mt-0.5 font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">Vente en ligne</h2>
              </div>
              <span className="rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                {onlineOrders.length} billet{onlineOrders.length > 1 ? "s" : ""} vendu{onlineOrders.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <form action={toggleSalesAction.bind(null, event.id)}>
                <button
                  type="submit"
                  title={salesOpen ? "Fermer les ventes en ligne" : "Rouvrir les ventes en ligne"}
                  className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition ${
                    salesOpen
                      ? "border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-400 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300"
                      : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-400 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${salesOpen ? "bg-emerald-500" : "bg-red-500"}`} />
                  {salesOpen ? "Fermer les ventes" : "Rouvrir les ventes"}
                </button>
              </form>
              <span className="font-bold text-brand-600 dark:text-brand-400">{formatFcfa(onlineRevenue)}</span>
              <a
                href={salesUrl ?? "#"}
                target={salesUrl ? "_blank" : undefined}
                rel="noopener noreferrer"
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${salesUrl ? "bg-gradient-to-r from-brand-600 to-brand-700 text-white shadow-lg shadow-brand-600/30 hover:-translate-y-0.5" : "pointer-events-none bg-slate-100 text-slate-400"}`}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                Voir la boutique
              </a>
            </div>
          </div>

          <div className="space-y-4 p-6">
            {salesCreated && (
              <div className="animate-fade-up flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm font-semibold text-brand-700 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300">
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" /></svg>
                Événement créé ! Partagez ce lien pour vendre les billets en ligne.
              </div>
            )}

            {!salesOpen && (
              <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-semibold text-amber-700 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                Ventes en ligne fermées — vos clients ne peuvent plus acheter sur ce lien. Vous pouvez les rouvrir à tout moment.
              </div>
            )}
            {event.salesAtDoor === false && (
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" /><path d="M2 8h8M9 12l7 7 7-7M17 19V5" /></svg>
                Vente à la porte <b>désactivée</b> : les ventes en ligne s&apos;arrêtent au début de l&apos;événement.
              </p>
            )}
            {event.salesAtDoor !== false && event.doorsOpen && (
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" /><path d="M2 8h8M9 12l7 7 7-7M17 19V5" /></svg>
                Portes ouvertes à <b>{event.doorsOpen}</b> · vente à la porte autorisée (boutique ouverte pendant l&apos;événement).
              </p>
            )}

            {salesUrl ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Lien d&apos;achat des billets</p>
                <div className="flex flex-wrap items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 font-mono text-sm text-brand-700 dark:border-slate-700 dark:bg-slate-800 dark:text-brand-300">
                    {salesUrl}
                  </code>
                  <CopyLink url={salesUrl} />
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(`${event.name} — achetez vos billets ici : ${salesUrl}`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-green-600/20 transition hover:-translate-y-0.5 hover:brightness-95"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                    WhatsApp
                  </a>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Envoyez ce lien à vos clients : ils choisissent leur billet, paient par mobile money (MTN MoMo, Moov Money, Celtiis Cash) et reçoivent leur ticket QR sur WhatsApp.
                </p>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/50">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Ce lien n&apos;est pas encore disponible. Générez-le pour ouvrir la boutique en ligne de cet événement.
                </p>
                <form action={generateSalesSlugAction.bind(null, event.id)}>
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></svg>
                    Générer le lien de vente
                  </button>
                </form>
              </div>
            )}

            {onlineOrders.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800">
                      <th className="pb-2 pr-4">Référence</th>
                      <th className="pb-2 pr-4">Client</th>
                      <th className="pb-2 pr-4">Billet</th>
                      <th className="pb-2 pr-4">Date</th>
                      <th className="pb-2 text-right">Montant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {onlineOrders.map((o) => (
                      <tr key={o.id}>
                        <td className="py-2.5 pr-4 font-mono text-xs font-bold text-brand-600 dark:text-brand-400">{o.reference}</td>
                        <td className="py-2.5 pr-4 font-semibold text-slate-800 dark:text-slate-200">{o.customerName}</td>
                        <td className="py-2.5 pr-4 text-slate-500 dark:text-slate-400">{o.category?.name ?? "Standard"}</td>
                        <td className="py-2.5 pr-4 text-slate-500 dark:text-slate-400">
                          {o.paidAt?.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                        </td>
                        <td className="py-2.5 text-right font-bold text-slate-800 dark:text-slate-200">{formatFcfa(o.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Réservations en attente de paiement */}
        {pendingOrders.length > 0 && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-white shadow-sm dark:border-amber-900/40 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-100 px-6 py-4 dark:border-amber-900/40">
              <div className="flex items-center gap-2">
                <h2 className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                  <svg className="h-5 w-5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                  Réservations en attente de paiement
                </h2>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  {pendingOrders.length} commande{pendingOrders.length > 1 ? "s" : ""} · {pendingSeats} place{pendingSeats > 1 ? "s" : ""}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Ces places sont bloquées <b>{expiryMinutes} min</b> puis libérées automatiquement si le paiement n&apos;est pas validé.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-amber-100 text-xs font-bold uppercase tracking-wide text-slate-400 dark:border-amber-900/40">
                    <th className="py-3 pl-6 pr-4">Référence</th>
                    <th className="py-3 pr-4">Client</th>
                    <th className="py-3 pr-4">Billet</th>
                    <th className="py-3 pr-4">Qté</th>
                    <th className="py-3 pr-4">Téléphone</th>
                    <th className="py-3 pr-4">Expire dans</th>
                    <th className="py-3 pr-6 text-right">Montant</th>
                    <th className="py-3 pr-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pendingOrders.map((o) => {
                    const expiresAt = new Date(o.createdAt.getTime() + ORDER_EXPIRY_MS);
                    return (
                      <tr key={o.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-3 pl-6 pr-4 font-mono text-xs font-bold text-slate-500 dark:text-slate-400">{o.reference}</td>
                        <td className="max-w-[160px] truncate py-3 pr-4 font-semibold text-slate-800 dark:text-slate-200">{o.customerName}</td>
                        <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">{o.category?.name ?? "Standard"}</td>
                        <td className="py-3 pr-4 text-slate-500 dark:text-slate-400">× {o.quantity}</td>
                        <td className="py-3 pr-4 font-mono text-xs text-slate-500 dark:text-slate-400">{displayPhone(o.customerPhone)}</td>
                        <td className="py-3 pr-4">
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                            jusqu&apos;à {expiresAt.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </td>
                        <td className="py-3 pr-6 text-right font-bold text-slate-800 dark:text-slate-200">{formatFcfa(o.amount)}</td>
                        <td className="py-3 pr-6 text-right">
                          <form action={cancelPendingOrderAction.bind(null, event.id, o.id)}>
                            <button
                              type="submit"
                              title="Annuler et libérer les places"
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-red-950"
                            >
                              Libérer
                            </button>
                          </form>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Invités + billets */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {/* Cycle de vie des invitations */}
          {event.tickets.length > 0 && (
            <div className="grid grid-cols-3 gap-px overflow-hidden rounded-t-2xl border-b border-slate-100 bg-slate-100 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-6">
              {inviteSummary.map((s, i) => (
                <div key={s.key} className={`bg-white px-4 py-3 text-center dark:bg-slate-900 ${i === 0 ? "rounded-tl-2xl" : ""}`}>
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white">{s.count}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{s.label}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-500/10 text-brand-600 dark:text-brand-400">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-400">Accès</p>
                  <h2 className="mt-0.5 font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">Invitations</h2>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{event.tickets.length}</span>
                {event.tickets.some((t) => t.category?.zones) && (
                  <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                    {event.tickets.filter((t) => t.category?.zones).length} accréditation{event.tickets.filter((t) => t.category?.zones).length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Import CSV */}
              <details className="group relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-brand-500 hover:text-brand-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                  Importer CSV
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                  <form action={importGuestsAction} className="space-y-3">
                    <input type="hidden" name="eventId" value={event.id} />
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Fichier CSV (.csv)</label>
                      <input
                        type="file"
                        name="file"
                        accept=".csv,text/csv"
                        required
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 outline-none file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:file:bg-brand-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300"
                      />
                    </div>
                    <p className="text-xs leading-relaxed text-slate-400">
                      Colonnes attendues : <b>nom ; téléphone ; catégorie ; email (opt.) ; personnes (opt.)</b>.
                      « personnes » = accès autorisés (le +1). Les doublons de téléphone sont ignorés.
                    </p>
                    <p className="text-xs">
                      <a
                        href="/api/csv-template"
                        download
                        className="inline-flex items-center gap-1 font-bold text-brand-600 hover:underline dark:text-brand-400"
                      >
                        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>
                        Télécharger le modèle CSV
                      </a>
                    </p>
                    <button type="submit" className="w-full rounded-lg bg-brand-600 py-2 text-sm font-bold text-white transition hover:bg-brand-700">
                      Importer et générer les billets
                    </button>
                  </form>
                </div>
              </details>

              {/* Ajout manuel */}
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  Ajouter un invité
                </summary>
                <div className="absolute right-0 z-10 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                  <form action={addGuestAction} className="space-y-3">
                    <input type="hidden" name="eventId" value={event.id} />
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Nom complet *</label>
                      <input name="guestName" required placeholder="Aya Hounkpatin" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Téléphone (pour WhatsApp)</label>
                      <input name="guestPhone" placeholder="97 12 34 56" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Email (pour l&apos;envoi par email)</label>
                      <input name="guestEmail" type="email" placeholder="aya@exemple.com" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Personnes (+1)</label>
                        <select name="guestCount" defaultValue="1" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white">
                          {[1, 2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={n}>{n} personne{n > 1 ? "s" : ""}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Catégorie</label>
                        <select name="categoryId" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white">
                          {event.categories.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <button type="submit" className="w-full rounded-lg bg-brand-600 py-2 text-sm font-bold text-white transition hover:bg-brand-700">
                      Générer l&apos;invitation
                    </button>
                  </form>
                </div>
              </details>
            </div>
          </div>

          {/* Envoi groupé des invitations */}
          {bulkInvites.length > 0 && (
            <div className="px-6 pt-5">
              <InviteBulkSend eventId={event.id} invites={bulkInvites} />
            </div>
          )}

          {visibleTickets.length === 0 ? (
            <div className="p-10 text-center text-slate-500 dark:text-slate-400">
              Aucun billet généré. Ajoutez un invité ou importez une liste CSV pour créer les billets QR.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 lg:grid-cols-3">
              {visibleTickets.map((ticket) => {
                const guestCount = Math.max(1, ticket.guestCount || 1);
                const inviteLink = emailInviteLink(ticket.guestEmail, event.name, ticket.guestName, ticket.code, guestCount);
                const whatsapp = whatsappInviteLink(ticket.guestPhone, event.name, ticket.guestName, ticket.code, guestCount);
                const sms = smsInviteLink(ticket.guestPhone, event.name, ticket.guestName, ticket.code, guestCount);
                const inviteBadge =
                  ticket.inviteStatus === InvitationStatus.CREATED
                    ? { label: "Créée", cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300" }
                    : ticket.inviteStatus === InvitationStatus.SENT
                      ? { label: "Envoyée", cls: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300" }
                      : ticket.inviteStatus === InvitationStatus.OPENED
                        ? { label: "Ouverte", cls: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300" }
                        : ticket.inviteStatus === InvitationStatus.CONFIRMED
                          ? { label: "Confirmée", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" }
                          : ticket.inviteStatus === InvitationStatus.ENTERED
                            ? { label: "Entrée", cls: "bg-brand-100 text-brand-700 dark:bg-brand-950 dark:text-brand-300" }
                            : ticket.inviteStatus === InvitationStatus.CANCELLED
                              ? { label: "Annulée", cls: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" }
                              : { label: "Générée", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" };
                return (
                  <div key={ticket.id} className={`rounded-2xl border p-4 transition hover:shadow-lg ${ticket.status === TicketStatus.ENTERED ? "border-brand-200 bg-brand-50/50 dark:border-brand-900 dark:bg-brand-950/30" : ticket.status === TicketStatus.BLACKLISTED ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30" : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800"}`}>
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-bold text-slate-900 dark:text-white">{ticket.guestName}</p>
                        <p className="text-xs text-slate-400">
                          {ticket.category?.name ?? "—"} · {ticket.guestPhone ? displayPhone(ticket.guestPhone) : "sans téléphone"}
                          {guestCount > 1 ? ` · ${guestCount} pers.` : ""}
                        </p>
                        {ticket.category?.zones && (
                          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                            Accréditation · {ticket.category.zones.split(",").join(", ")}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${inviteBadge.cls}`}>{inviteBadge.label}</span>
                        {ticket.status === TicketStatus.BLACKLISTED && (
                          <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-bold text-red-700 dark:bg-red-950 dark:text-red-300">Liste noire</span>
                        )}
                        {guestCount > 1 && ticket.status !== TicketStatus.ENTERED && (
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${ticket.entriesCount > 0 ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300"}`}>
                            {ticket.entriesCount}/{guestCount} entrées
                          </span>
                        )}
                      </div>
                    </div>

                    <LazyQr content={ticketQrContent(ticket)} size={144} className="mx-auto h-36 w-36 rounded-xl bg-white p-1.5" />

                    <p className="mt-2 truncate text-center font-mono text-[11px] text-slate-400">{ticket.code}</p>
                    <a
                      href={`/i/${ticket.code}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 block truncate text-center text-[11px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
                    >
                      Voir l&apos;invitation →
                    </a>

                    <div className="mt-3 flex gap-1.5">
                      {whatsapp && ticket.status !== TicketStatus.ENTERED && ticket.inviteStatus !== InvitationStatus.CANCELLED && (
                        <a
                          href={whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Envoyer sur WhatsApp"
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#25D366] text-white transition hover:brightness-95"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/></svg>
                        </a>
                      )}
                      {inviteLink && ticket.status !== TicketStatus.ENTERED && ticket.inviteStatus !== InvitationStatus.CANCELLED && (
                        <a
                          href={inviteLink}
                          title="Envoyer par email"
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 transition hover:bg-brand-100 hover:text-brand-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-brand-950"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 5L2 7" /></svg>
                        </a>
                      )}
                      {sms && ticket.status !== TicketStatus.ENTERED && ticket.inviteStatus !== InvitationStatus.CANCELLED && (
                        <a
                          href={sms}
                          title="Envoyer par SMS"
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 transition hover:bg-sky-100 hover:text-sky-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-sky-950"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                        </a>
                      )}
                      {ticket.status !== TicketStatus.ENTERED && ticket.inviteStatus !== InvitationStatus.CANCELLED && ticket.inviteStatus !== InvitationStatus.CONFIRMED && (
                        <form action={setInviteStatusAction.bind(null, ticket.id, event.id, InvitationStatus.CONFIRMED)}>
                          <button
                            type="submit"
                            title="Confirmer la présence"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-600 transition hover:bg-emerald-200 dark:bg-emerald-950 dark:text-emerald-400"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                          </button>
                        </form>
                      )}
                      {ticket.inviteStatus !== InvitationStatus.CANCELLED && ticket.status !== TicketStatus.ENTERED && (
                        <form action={setInviteStatusAction.bind(null, ticket.id, event.id, InvitationStatus.CANCELLED)}>
                          <button
                            type="submit"
                            title="Annuler l'invitation"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400 transition hover:bg-red-100 hover:text-red-600 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-red-950"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                          </button>
                        </form>
                      )}
                      {ticket.inviteStatus === InvitationStatus.CANCELLED && (
                        <form action={setInviteStatusAction.bind(null, ticket.id, event.id, InvitationStatus.GENERATED)}>
                          <button
                            type="submit"
                            title="Réactiver l'invitation"
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-500 transition hover:bg-emerald-100 hover:text-emerald-600 dark:bg-slate-700 dark:text-slate-300"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
                          </button>
                        </form>
                      )}
                      <form action={blacklistTicketAction.bind(null, ticket.id, event.id, "")}>
                        <button
                          type="submit"
                          title={ticket.status === TicketStatus.BLACKLISTED ? "Retirer de la liste noire" : "Mettre en liste noire"}
                          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition ${ticket.status === TicketStatus.BLACKLISTED ? "bg-red-600 text-white hover:bg-red-700" : "bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-600 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-red-950"}`}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0-20 0" /><path d="M9 10h.01M15 10h.01M9 15h6" /></svg>
                        </button>
                      </form>
                    </div>

                    {/* Modifier l'invitation (email / nombre de personnes) */}
                    <details className="group mt-2">
                      <summary className="cursor-pointer list-none text-center text-[11px] font-semibold text-slate-400 transition hover:text-brand-600 dark:hover:text-brand-400">
                        Modifier ({ticket.guestEmail ? ticket.guestEmail : "sans email"})
                      </summary>
                      <form action={updateGuestAction} className="mt-2 space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                        <input type="hidden" name="eventId" value={event.id} />
                        <input type="hidden" name="ticketId" value={ticket.id} />
                        <input
                          name="guestEmail"
                          type="email"
                          defaultValue={ticket.guestEmail ?? ""}
                          placeholder="email@exemple.com"
                          className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                        />
                        <div className="flex items-center gap-2">
                          <input
                            name="guestCount"
                            type="number"
                            min={1}
                            max={10}
                            defaultValue={guestCount}
                            className="w-16 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-center text-xs outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white"
                          />
                          <span className="text-[11px] text-slate-400">personne(s) autorisée(s)</span>
                        </div>
                        <button
                          type="submit"
                          className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-bold text-white transition hover:bg-brand-700"
                        >
                          Enregistrer
                        </button>
                      </form>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bandeau identifiant du terminal (rappelé après création) */}
        {reveal?.kind === "terminalPin" && (
          <div className="animate-fade-up mb-6 flex items-start gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm font-semibold text-brand-700 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300">
            <svg className="mt-0.5 h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
            <div>
              {terminalRegenerated
                ? `Identifiant du terminal « ${reveal.name} ».`
                : `Terminal « ${reveal.name} » créé.`}
              <span className="mt-1 block text-xs font-normal text-brand-600 dark:text-brand-400">
                Identifiant du terminal : <b className="font-mono text-lg tracking-widest">{reveal.secret}</b> — l&apos;agent le saisit dans SIGMA Scanner pour activer le terminal.
              </span>
            </div>
          </div>
        )}

        {/* Bandeaux fonction urgence */}
        {entranceBlocked && (
          <div className="animate-fade-up mb-6 flex items-center gap-3 rounded-2xl border-2 border-red-300 bg-red-50 px-5 py-4 text-sm font-bold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
            Entrées temporairement suspendues — tous les terminaux refusent les billets.
          </div>
        )}
        {entranceBlockedNow && !entranceBlocked && (
          <div className="animate-fade-up mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><path d="M12 9v4M12 17h.01" /></svg>
            Urgence désactivée — les entrées ont été rétablies.
          </div>
        )}
        {entranceReopened && (
          <div className="animate-fade-up mb-6 flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm font-semibold text-brand-700 dark:border-brand-900 dark:bg-brand-950 dark:text-brand-300">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" /></svg>
            Les entrées sont de nouveau autorisées sur tous les terminaux.
          </div>
        )}

        {/* ===== SIGMA Scanner : terminaux + urgence ===== */}
        {/* Pas de `overflow-hidden` ici : il couperait les panneaux déroulants
            `absolute` des formulaires (Ajouter une porte / Changer de zone). */}
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-slate-900 dark:text-white">Terminaux SIGMA Scanner</h2>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                {event.terminals.length} porte{event.terminals.length > 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Fonction urgence */}
              <form action={toggleEntranceBlockedAction.bind(null, event.id)}>
                <button
                  type="submit"
                  title={entranceBlocked ? "Rétablir les entrées" : "Suspendre immédiatement toutes les entrées"}
                  className={`flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-sm font-extrabold transition ${
                    entranceBlocked
                      ? "border-brand-500 bg-brand-50 text-brand-700 hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-300"
                      : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
                  }`}
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                  {entranceBlocked ? "RÉACTIVER LES ENTRÉES" : "BLOQUER LES ENTRÉES"}
                </button>
              </form>
              {/* Ajouter un terminal */}
              <details className="group relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                  Ajouter une porte
                </summary>
                <div className="absolute right-0 z-20 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                  <form action={createTerminalAction} className="space-y-3">
                    <input type="hidden" name="eventId" value={event.id} />
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Nom de la porte *</label>
                      <input name="terminalName" required placeholder="Porte B — VIP" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Zone d&apos;accès</label>
                      <select name="terminalZone" defaultValue="" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white">
                        <option value="">Toutes zones (contrôle général)</option>
                        {zoneList.map((z) => (
                          <option key={z} value={z}>{z}</option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-slate-400">
                        Si la porte limite l&apos;accès, seuls les billets autorisés pour cette zone entrent (accréditations).
                      </p>
                    </div>
                    <button type="submit" className="w-full rounded-lg bg-brand-600 py-2 text-sm font-bold text-white transition hover:bg-brand-700">
                      Créer le terminal
                    </button>
                  </form>
                </div>
              </details>
            </div>
          </div>

          {event.terminals.length === 0 ? (
            <div className="border-t border-dashed border-slate-200 p-10 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              Aucun terminal. Créez une porte (Porte A, B…) — son identifiant (ex : T-9281) sera saisi par l&apos;agent dans l&apos;application SIGMA Scanner pour l&apos;activer.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2">
              {terminalRows.map((t) => {
                const statusMeta =
                  t.status === TerminalStatus.ACTIVE
                    ? { dot: "bg-emerald-500", label: "Actif", text: "text-emerald-600 dark:text-emerald-400" }
                    : t.status === TerminalStatus.INACTIVE
                      ? { dot: "bg-amber-500", label: "À activer", text: "text-amber-600 dark:text-amber-400" }
                      : t.status === TerminalStatus.DISABLED
                        ? { dot: "bg-orange-500", label: "Désactivé", text: "text-orange-600 dark:text-orange-400" }
                        : { dot: "bg-red-500", label: "Révoqué", text: "text-red-600 dark:text-red-400" };
                const lastSeen = t.lastSeenAt
                  ? `Activité il y a ${secondsSince(t.lastSeenAt)} s`
                  : "Jamais connecté";
                return (
                  <div key={t.id} className="rounded-2xl border border-slate-200 p-4 transition hover:shadow-md dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusMeta.dot} ${t.status === TerminalStatus.ACTIVE ? "animate-pulse" : ""}`} />
                        <p className="truncate font-mono text-sm font-extrabold text-slate-900 dark:text-white">{t.code}</p>
                      </div>
                      <span className={`rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide dark:bg-slate-800 ${statusMeta.text}`}>
                        {statusMeta.label}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-sm font-bold text-slate-800 dark:text-slate-200">{t.name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                      {t.zone && <span className="font-mono">zone : {t.zone}</span>}
                      <span>{t.agent ? `Agent : ${t.agent.name}` : "Aucun agent"}</span>
                      <span>{t.scans} scan{t.scans > 1 ? "s" : ""}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{lastSeen}</p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {(t.status === TerminalStatus.INACTIVE || t.status === TerminalStatus.DISABLED) && (
                        <form action={regenerateTerminalCodeAction.bind(null, event.id, t.id)}>
                          <button type="submit" className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-bold text-white transition hover:bg-brand-700">
                            Rappeler l&apos;identifiant
                          </button>
                        </form>
                      )}
                      {t.status === TerminalStatus.REVOKED ? (
                        <form action={setTerminalStatusAction.bind(null, event.id, t.id, TerminalStatus.INACTIVE)}>
                          <button type="submit" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 transition hover:border-brand-300 hover:text-brand-600 dark:border-slate-700">
                            Réactiver
                          </button>
                        </form>
                      ) : (
                        <form action={setTerminalStatusAction.bind(null, event.id, t.id, t.status === TerminalStatus.ACTIVE ? TerminalStatus.DISABLED : TerminalStatus.ACTIVE)}>
                          <button
                            type="submit"
                            className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition ${
                              t.status === TerminalStatus.ACTIVE
                                ? "border-amber-200 text-amber-600 hover:bg-amber-50 dark:border-amber-900 dark:text-amber-300"
                                : "border-brand-200 text-brand-600 hover:bg-brand-50 dark:border-brand-800 dark:text-brand-300"
                            }`}
                          >
                            {t.status === TerminalStatus.ACTIVE ? "Désactiver" : "Activer"}
                          </button>
                        </form>
                      )}
                      <form action={setTerminalStatusAction.bind(null, event.id, t.id, TerminalStatus.REVOKED)}>
                        <button type="submit" title="Révoquer définitivement" className="rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-bold text-red-500 transition hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950">
                          Révoquer
                        </button>
                      </form>
                      <details className="group relative">
                        <summary className="cursor-pointer list-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11px] font-bold text-slate-500 transition hover:border-brand-300 hover:text-brand-600 dark:border-slate-700 dark:text-slate-400">
                          Changer de zone
                        </summary>
                        <div className="absolute left-0 z-30 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                          <form action={setTerminalZoneAction} className="space-y-2">
                            <input type="hidden" name="eventId" value={event.id} />
                            <input type="hidden" name="terminalId" value={t.id} />
                            <select name="terminalZone" defaultValue={t.zone ?? ""} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white">
                              <option value="">Toutes zones</option>
                              {zoneList.map((z) => (
                                <option key={z} value={z}>{z}</option>
                              ))}
                            </select>
                            <button type="submit" className="w-full rounded-lg bg-brand-600 py-1.5 text-xs font-bold text-white transition hover:bg-brand-700">
                              Appliquer
                            </button>
                          </form>
                        </div>
                      </details>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Agents de contrôle */}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
            <h2 className="font-bold text-slate-900 dark:text-white">
              Agents de contrôle <span className="ml-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">{agentRows.length}</span>
            </h2>
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-brand-600/30 transition hover:-translate-y-0.5">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                Ajouter un agent
              </summary>
              <div className="absolute right-0 z-10 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
                <form action={addAgentAction} className="space-y-3">
                  <input type="hidden" name="eventId" value={event.id} />
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Nom complet *</label>
                    <input name="agentName" required placeholder="Rachidi Agbessi" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600 dark:text-slate-300">Téléphone *</label>
                    <input name="agentPhone" required placeholder="97 11 22 33" className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-brand-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white" />
                  </div>
                  <p className="text-xs leading-relaxed text-slate-400">
                    Un code PIN à 4 chiffres sera généré et affiché une seule fois — à transmettre à l&apos;agent.
                  </p>
                  <button type="submit" className="w-full rounded-lg bg-brand-600 py-2 text-sm font-bold text-white transition hover:bg-brand-700">
                    Créer et assigner
                  </button>
                </form>
              </div>
            </details>
          </div>

          {agentRows.length === 0 ? (
            <div className="p-10 text-center text-slate-500 dark:text-slate-400">
              Aucun agent assigné. Ajoutez un agent pour qu&apos;il puisse scanner les billets de cet événement.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2 lg:grid-cols-3">
              {agentRows.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 transition hover:shadow-md dark:border-slate-700">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-extrabold text-white">
                    {initials(a.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900 dark:text-white">{a.name}</p>
                    <p className="text-xs text-slate-400">{displayPhone(a.phone)}</p>
                    <p className="mt-0.5 text-xs font-semibold text-brand-600 dark:text-brand-400">
                      {a.scans} entrée{a.scans > 1 ? "s" : ""} validée{a.scans > 1 ? "s" : ""}
                    </p>
                  </div>
                  <form action={resetAgentPinAction.bind(null, event.id, a.agentId)}>
                    <button
                      type="submit"
                      title="Nouveau PIN (l'agent a oublié le sien)"
                      className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-400 transition hover:bg-amber-100 hover:text-amber-600 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-amber-950"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
                    </button>
                  </form>
                  <form action={removeAgentAction.bind(null, event.id, a.agentId)}>
                    <button
                      type="submit"
                      title="Retirer de l'événement"
                      className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-400 transition hover:bg-red-100 hover:text-red-600 dark:bg-slate-700 dark:text-slate-400 dark:hover:bg-red-950"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      </div>
    </div>
  );
}
