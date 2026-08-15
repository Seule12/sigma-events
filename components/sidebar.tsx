"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "@/components/theme-provider";
import { logoutAction } from "@/app/actions";

export type SidebarEvent = { id: string; name: string };

const COLLAPSE_KEY = "sigma_sidebar_collapsed";

// Style des liens de navigation principaux : pilule active avec dégradé + liseré,
// icône dans une puce ; inactif discret avec hover doux.
function navItemCls(active: boolean, rail: boolean): string {
  const base = `mb-1 flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm font-bold transition-all ${
    rail ? "lg:justify-center lg:px-0" : ""
  }`;
  if (active) {
    return `${base} bg-gradient-to-r from-brand-500/20 via-brand-500/10 to-transparent text-white ring-1 ring-inset ring-brand-500/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]`;
  }
  return `${base} text-slate-400 hover:bg-slate-800/70 hover:text-white`;
}

function iconChipCls(active: boolean, rail: boolean): string {
  const base = `grid h-8 w-8 shrink-0 place-items-center rounded-lg transition-all duration-200 ${
    rail ? "" : ""
  }`;
  if (active) {
    return `${base} bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-900/40`;
  }
  return `${base} bg-slate-800/60 text-slate-400 group-hover:text-brand-300 group-hover:bg-brand-500/10`;
}

// En-tête de section : petite puce + titre mono majuscule.
function SectionLabel({ children, accent = false }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <p
      className={`mb-2 mt-6 flex items-center gap-2 px-3 text-[11px] font-bold uppercase tracking-widest ${
        accent ? "text-brand-400/90" : "text-slate-500"
      }`}
    >
      <span className={`h-1 w-1 rounded-full ${accent ? "bg-brand-400" : "bg-slate-600"}`} />
      {children}
    </p>
  );
}

export default function Sidebar({
  events,
  activeEventId,
  userName,
  isPro = false,
}: {
  events: SidebarEvent[];
  activeEventId?: string | null;
  userName: string;
  isPro?: boolean;
}) {
  const [open, setOpen] = useState(false); // drawer mobile
  const [collapsed, setCollapsed] = useState(false); // rail d'icônes desktop
  const pathname = usePathname();
  const isDashboard = pathname === "/dashboard";
  const drawerRef = useRef<HTMLElement>(null);

  // Restaure la préférence de repli (lecture différée pour éviter un setState synchrone).
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(COLLAPSE_KEY);
    } catch {
      /* stockage indisponible */
    }
    if (stored) {
      const t = window.setTimeout(() => setCollapsed(stored === "1"), 0);
      return () => window.clearTimeout(t);
    }
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-w", collapsed ? "4.75rem" : "18rem");
  }, [collapsed]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // Accessibilité du drawer : Échap, focus, verrouillage du scroll, aria-expanded.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // verrouille le scroll du fond sur mobile
    drawerRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        document.getElementById("sidebar-hamburger")?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const closeDrawer = () => {
    setOpen(false);
    document.getElementById("sidebar-hamburger")?.focus();
  };

  const rail = collapsed; // mode compact (desktop uniquement)

  // Sous-pages de l'événement actif (affichées sous « Mes événements »).
  const eventLinks = activeEventId
    ? [
        {
          href: `/events/${activeEventId}`,
          label: "Page de l'événement",
          icon: (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
          ),
        },
        {
          href: `/events/${activeEventId}/billets`,
          label: "Billets & impression",
          icon: (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M9 5v2M9 17v2" /></svg>
          ),
        },
        {
          href: `/events/${activeEventId}/rapport`,
          label: "Rapport de contrôle",
          icon: (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg>
          ),
        },
      ]
    : [];

  return (
    <>
      {/* Bouton hamburger — visible uniquement sur mobile */}
      <button
        id="sidebar-hamburger"
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu"
        aria-expanded={open}
        aria-controls="sidebar-drawer"
        className="fixed left-4 top-4 z-40 grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-lg backdrop-blur transition hover:border-brand-500 hover:text-brand-600 lg:hidden dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
      </button>

      {/* Fond sombre derrière le drawer mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar (drawer mobile / fixe desktop, repliable) */}
      <aside
        id="sidebar-drawer"
        ref={drawerRef}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label="Menu de navigation"
        tabIndex={-1}
        className={`fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-white/5 bg-slate-900 text-slate-300 shadow-2xl outline-none transition-all duration-300 ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        } ${rail ? "lg:w-[76px]" : ""}`}
      >
        {/* En-tête : logo + repli (desktop) / fermer (mobile) */}
        <div className="relative flex h-16 items-center justify-between border-b border-white/5 px-4">
          {/* Halo dégradé derrière le logo */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-brand-500/10 to-transparent" />
          <Link
            href="/dashboard"
            onClick={closeDrawer}
            title="Sigma Events — Tableau de bord"
            className="relative z-10 flex items-center justify-center gap-2"
          >
            {/* Marque compacte (bouclier) — visible en mode rail replié */}
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg shadow-brand-900/40">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
            </span>
            {!rail && (
              <span className="hidden font-display text-base font-bold uppercase tracking-[0.06em] text-white lg:block">
                Sigma <span className="text-brand-400">Events</span>
              </span>
            )}
          </Link>
          <div className="relative z-10 flex items-center gap-1">
            {/* Replier / déplier (desktop) */}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={rail ? "Déplier le menu" : "Replier le menu"}
              title={rail ? "Déplier le menu" : "Replier le menu"}
              className={`hidden h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white lg:grid ${rail ? "mx-auto" : ""}`}
            >
              <svg className={`h-5 w-5 transition-transform duration-300 ${rail ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M15 9l-3 3 3 3M9 9l-3 3 3 3" /></svg>
            </button>
            {/* Fermer (mobile) */}
            <button
              type="button"
              onClick={closeDrawer}
              aria-label="Fermer le menu"
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white lg:hidden"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <SectionLabel accent>Général</SectionLabel>

          {/* Tableau de bord */}
          <Link
            href="/dashboard"
            onClick={closeDrawer}
            title="Tableau de bord"
            aria-label="Tableau de bord"
            className={`group ${navItemCls(isDashboard, rail)}`}
          >
            <span className={iconChipCls(isDashboard, rail)}>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" rx="1.5" />
                <rect x="14" y="3" width="7" height="5" rx="1.5" />
                <rect x="14" y="12" width="7" height="9" rx="1.5" />
                <rect x="3" y="16" width="7" height="5" rx="1.5" />
              </svg>
            </span>
            <span className={rail ? "lg:hidden" : ""}>Tableau de bord</span>
          </Link>

          {/* Ventes */}
          <Link
            href="/ventes"
            onClick={closeDrawer}
            title="Suivi des ventes"
            aria-label="Suivi des ventes"
            className={`group ${navItemCls(pathname === "/ventes", rail)}`}
          >
            <span className={iconChipCls(pathname === "/ventes", rail)}>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="M7 14l4-4 3 3 5-6" />
              </svg>
            </span>
            <span className={rail ? "lg:hidden" : ""}>Suivi des ventes</span>
          </Link>

          {/* Transactions */}
          <Link
            href="/transactions"
            onClick={closeDrawer}
            title="Transactions"
            aria-label="Transactions"
            className={`group ${navItemCls(pathname === "/transactions", rail)}`}
          >
            <span className={iconChipCls(pathname === "/transactions", rail)}>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path d="M2 10h20M6 15h4" />
              </svg>
            </span>
            <span className={rail ? "lg:hidden" : ""}>Transactions</span>
          </Link>

          {/* Notifications */}
          <Link
            href="/notifications"
            onClick={closeDrawer}
            title="Notifications"
            aria-label="Notifications"
            className={`group relative ${navItemCls(pathname === "/notifications", rail)}`}
          >
            <span className={iconChipCls(pathname === "/notifications", rail)}>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </span>
            <span className={rail ? "lg:hidden" : ""}>Notifications</span>
            {/* Badge temps réel (mis à jour par LiveNotifications) */}
            <span
              data-notif-badge
              className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow"
            />
          </Link>

          {/* Espace agence (comptes Professionnels de l'événementiel) */}
          {isPro && (
            <Link
              href="/pro"
              onClick={closeDrawer}
              title="Espace agence"
              aria-label="Espace agence"
              className={`group ${navItemCls(pathname === "/pro", rail)}`}
            >
              <span className={iconChipCls(pathname === "/pro", rail)}>
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="7" width="20" height="14" rx="2" />
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                </svg>
              </span>
              <span className={rail ? "lg:hidden" : ""}>Espace agence</span>
            </Link>
          )}

          {/* Nouvel événement — action rapide */}
          <Link
            href="/dashboard#create-event"
            onClick={closeDrawer}
            title="Créer un événement"
            aria-label="Créer un événement"
            className={`group mb-2 mt-4 flex items-center gap-3 rounded-xl bg-gradient-to-r from-brand-600 to-brand-700 px-3 py-2.5 text-sm font-bold text-white shadow-lg shadow-brand-900/40 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-brand-800/40 ${
              rail ? "lg:justify-center lg:px-0" : ""
            }`}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/15">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </span>
            <span className={rail ? "lg:hidden" : ""}>Nouvel événement</span>
          </Link>

          {/* Mes événements */}
          <SectionLabel>
            Mes événements
            <span className="ml-1 rounded-full bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-400">{events.length}</span>
          </SectionLabel>
          {events.length === 0 ? (
            <p className={`px-3 py-2 text-xs text-slate-500 ${rail ? "lg:hidden" : ""}`}>
              Aucun événement. Créez le premier avec « Nouvel événement ».
            </p>
          ) : (
            <div className="space-y-0.5">
              {events.map((event) => {
                const active = event.id === activeEventId;
                return (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    onClick={closeDrawer}
                    title={event.name}
                    aria-label={event.name}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                      active
                        ? "bg-gradient-to-r from-brand-500/15 to-transparent font-bold text-white ring-1 ring-inset ring-brand-500/20"
                        : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
                    } ${rail ? "lg:justify-center lg:px-0" : ""}`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full transition ${
                        active ? "bg-brand-400 shadow-[0_0_8px_rgba(45,212,191,0.6)]" : "bg-slate-600"
                      }`}
                    />
                    <span className={`truncate ${rail ? "lg:hidden" : ""}`}>{event.name}</span>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Événement actif : sous-pages */}
          {activeEventId && eventLinks.length > 0 && (
            <>
              <SectionLabel accent>Événement actif</SectionLabel>
              <div className="space-y-0.5">
                {eventLinks.map((l) => {
                  const activeLink = pathname === l.href;
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={closeDrawer}
                      title={l.label}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${
                        activeLink
                          ? "bg-gradient-to-r from-brand-500/15 to-transparent font-bold text-white ring-1 ring-inset ring-brand-500/20"
                          : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
                      } ${rail ? "lg:justify-center lg:px-0" : ""}`}
                    >
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg transition ${
                          activeLink ? "bg-brand-500/15 text-brand-400" : "text-slate-500"
                        }`}
                      >
                        {l.icon}
                      </span>
                      <span className={rail ? "lg:hidden" : ""}>{l.label}</span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}

          {/* Ressources */}
          <SectionLabel>Ressources</SectionLabel>
          {/* Retrouver mon billet */}
          <Link
            href="/mon-billet"
            onClick={closeDrawer}
            title="Retrouver mon billet"
            className={`group mb-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-800/70 hover:text-white ${rail ? "lg:justify-center lg:px-0" : ""}`}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-800/60 text-slate-400 transition-colors group-hover:bg-brand-500/10 group-hover:text-brand-300">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" /><path d="M9 5v2M9 17v2" /></svg>
            </span>
            <span className={rail ? "lg:hidden" : ""}>Retrouver un billet</span>
          </Link>
          <Link
            href="/"
            onClick={closeDrawer}
            title="Site public"
            className={`group mb-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-800/70 hover:text-white ${rail ? "lg:justify-center lg:px-0" : ""}`}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-800/60 text-slate-400 transition-colors group-hover:bg-brand-500/10 group-hover:text-brand-300">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
            </span>
            <span className={rail ? "lg:hidden" : ""}>Site public</span>
          </Link>
          <Link
            href="/support"
            onClick={closeDrawer}
            title="Aide & support"
            className={`group mb-1 flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-800/70 hover:text-white ${rail ? "lg:justify-center lg:px-0" : ""}`}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-800/60 text-slate-400 transition-colors group-hover:bg-brand-500/10 group-hover:text-brand-300">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            </span>
            <span className={rail ? "lg:hidden" : ""}>Aide &amp; support</span>
          </Link>
        </nav>

        {/* Bas de page */}
        <div className="border-t border-white/5 p-3">
          {/* Mon profil */}
          <Link
            href="/profil"
            onClick={closeDrawer}
            title="Mon profil"
            aria-label="Mon profil"
            className={`group mb-2 flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-400 transition hover:bg-slate-800/70 hover:text-white ${rail ? "lg:justify-center lg:px-0" : ""}`}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-800/60 text-slate-400 transition-colors group-hover:bg-brand-500/10 group-hover:text-brand-300">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
            </span>
            <span className={rail ? "lg:hidden" : ""}>Mon profil</span>
          </Link>

          {/* Carte utilisateur */}
          <div className={`mb-2 flex items-center gap-3 rounded-2xl bg-slate-800/50 p-2.5 ring-1 ring-inset ring-white/5 ${rail ? "lg:flex-col lg:gap-2 lg:px-0" : ""}`}>
            <div
              className="relative grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-emerald-500 text-xs font-extrabold text-white shadow-lg shadow-brand-900/40"
              title={userName}
            >
              <span className="absolute -inset-0.5 -z-10 rounded-full bg-gradient-to-br from-brand-500/40 to-emerald-500/40 blur-sm" />
              {userName
                .split(" ")
                .map((w) => w[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            {!rail && (
              <div className="min-w-0 flex-1 lg:block">
                <p className="truncate text-sm font-bold text-white">{userName}</p>
                <p className="font-mono text-[10px] uppercase tracking-wider text-brand-400/80">Organisateur</p>
              </div>
            )}
            <form action={logoutAction} className="flex items-center">
              <button
                type="submit"
                title="Déconnexion"
                aria-label="Déconnexion"
                className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-red-950/40 hover:text-red-400"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5M21 12H9" />
                </svg>
              </button>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
