"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkInAction, syncOfflineAction, searchTicketsAction, type CheckInResult, type OfflineEntry, type SearchTicketResult } from "@/app/actions";
import { CheckInStatus, TicketStatus } from "@/app/generated/prisma/enums";
import { localDB } from "@/lib/db-local";
import { displayPhone } from "@/lib/format";


type Result = CheckInResult & { at: string };

// Statut local (hors-ligne) : le scan est enregistré mais pas encore synchronisé.
const OFFLINE_QUEUED = "OFFLINE_QUEUED";
type DisplayStatus = CheckInStatus | typeof OFFLINE_QUEUED;

type DisplayResult = Result & { displayStatus: DisplayStatus };

const RESULT_STYLE: Record<DisplayStatus, { bg: string; ring: string; title: string }> = {
  [CheckInStatus.VALID]: {
    bg: "bg-gradient-to-br from-brand-500/90 to-brand-800",
    ring: "ring-brand-400",
    title: "Billet valide",
  },
  [CheckInStatus.ENTRY]: {
    bg: "bg-gradient-to-br from-emerald-500/90 to-emerald-800",
    ring: "ring-emerald-400",
    title: "Entrée partielle",
  },
  [CheckInStatus.ALREADY_SCANNED]: {
    bg: "bg-gradient-to-br from-amber-500/90 to-amber-800",
    ring: "ring-amber-400",
    title: "Billet déjà utilisé",
  },
  [CheckInStatus.INVALID]: {
    bg: "bg-gradient-to-br from-red-500/90 to-red-800",
    ring: "ring-red-400",
    title: "Billet invalide",
  },
  [CheckInStatus.FULL]: {
    bg: "bg-gradient-to-br from-red-500/90 to-red-800",
    ring: "ring-red-400",
    title: "Capacité atteinte",
  },
  [CheckInStatus.BLACKLISTED]: {
    bg: "bg-gradient-to-br from-red-500/90 to-red-800",
    ring: "ring-red-400",
    title: "Billet en liste noire",
  },
  [CheckInStatus.TOO_EARLY]: {
    bg: "bg-gradient-to-br from-amber-500/90 to-amber-800",
    ring: "ring-amber-400",
    title: "Trop tôt",
  },
  [CheckInStatus.EXPIRED]: {
    bg: "bg-gradient-to-br from-red-500/90 to-red-800",
    ring: "ring-red-400",
    title: "Événement terminé",
  },
  [CheckInStatus.WRONG_ZONE]: {
    bg: "bg-gradient-to-br from-amber-500/90 to-amber-800",
    ring: "ring-amber-400",
    title: "Accès non autorisé",
  },
  [CheckInStatus.SUSPENDED]: {
    bg: "bg-gradient-to-br from-red-500/90 to-red-800",
    ring: "ring-red-400",
    title: "Entrées suspendues",
  },
  [OFFLINE_QUEUED]: {
    bg: "bg-gradient-to-br from-sky-500/90 to-sky-800",
    ring: "ring-sky-400",
    title: "Enregistré hors-ligne",
  },
};

const STATUS_ICONS: Record<DisplayStatus, React.ReactNode> = {
  [CheckInStatus.VALID]: <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" />,
  [CheckInStatus.ENTRY]: (
    <>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" />
      <path d="M12 6v6l3 2" />
    </>
  ),
  [CheckInStatus.ALREADY_SCANNED]: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </>
  ),
  [CheckInStatus.INVALID]: <path d="M18 6L6 18M6 6l12 12" />,
  [CheckInStatus.FULL]: <path d="M18 6L6 18M6 6l12 12" />,
  [CheckInStatus.BLACKLISTED]: <path d="M18 6L6 18M6 6l12 12" />,
  [CheckInStatus.TOO_EARLY]: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  [CheckInStatus.EXPIRED]: <path d="M12 9v2M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />,
  [CheckInStatus.WRONG_ZONE]: (
    <>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ),
  [CheckInStatus.SUSPENDED]: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </>
  ),
  [OFFLINE_QUEUED]: (
    <>
      <path d="M12 3v10" />
      <path d="M12 13l4-4M12 13l-4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </>
  ),
};

// crypto.randomUUID exige un contexte sécurisé (HTTPS) : fallback pour les pilotes en http:// local.
function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export default function Scanner({ eventId }: { eventId: string }) {
  const [result, setResult] = useState<DisplayResult | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [manual, setManual] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchTicketResult[] | null>(null);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false); // garde anti-réentrance (lecture seule côté logique)
  const scannerRef = useRef<{ stop: () => Promise<void>; clear: () => void } | null>(null);
  const geoRef = useRef<{ lat: number; lng: number } | null>(null);

  // Géolocalisation optionnelle (traçabilité) — demandée au premier scan, non bloquante.
  const maybeCaptureGeo = useCallback(() => {
    if (geoRef.current || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        geoRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      },
      () => {},
      { timeout: 3000, maximumAge: 600_000 }
    );
  }, []);

  // ---- File d'attente hors-ligne (IndexedDB) ----

  const readQueue = useCallback(async (): Promise<OfflineEntry[]> => {
    return localDB.getScans();
  }, []);

  const saveQueue = useCallback(
    async (queue: OfflineEntry[]) => {
      await localDB.clearScans();
      for (const entry of queue) {
        await localDB.addScan(entry);
      }
      setPending(queue.length);
    },
    []
  );

  useEffect(() => {
    // Lecture initiale au montage
    readQueue().then((q) => setPending(q.length));
  }, [readQueue]);

  const queueScan = useCallback(
    async (code: string) => {
      const entry: OfflineEntry = {
        syncId: genId(),
        code: code.trim().toUpperCase(),
        scannedAt: new Date().toISOString(),
        ...(geoRef.current ? { lat: geoRef.current.lat, lng: geoRef.current.lng } : {}),
      };
      const currentQueue = await readQueue();
      await saveQueue([...currentQueue, entry]);
      return entry;
    },
    [readQueue, saveQueue]
  );

  const syncQueue = useCallback(async () => {
    const queue = await readQueue();
    if (queue.length === 0 || syncing) return;
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await syncOfflineAction(eventId, queue);
      const processed = new Set(res.processedIds);
      const remaining = queue.filter((e) => !processed.has(e.syncId));
      await saveQueue(remaining);
      setSyncMsg(
        res.synced > 0
          ? `✓ ${res.synced} scan${res.synced > 1 ? "s" : ""} synchronisé${res.synced > 1 ? "s" : ""}`
          : res.alreadySynced > 0
            ? `✓ Déjà synchronisé${res.alreadySynced > 1 ? "s" : ""} (${res.alreadySynced})`
            : "Rien à synchroniser"
      );
      if (res.failed > 0) {
        setSyncMsg((m) => `${m} · ${res.failed} en attente`);
      }
    } catch {
      setSyncMsg("Échec de la synchronisation — nouvelle tentative au retour du réseau.");
    } finally {
      setSyncing(false);
    }
  }, [eventId, readQueue, saveQueue, syncing]);

  // Auto-synchronisation quand le réseau revient.
  useEffect(() => {
    const onOnline = () => {
      setSyncMsg("Réseau rétabli — synchronisation…");
      syncQueue();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [syncQueue]);

  const handleCode = useCallback(
    async (code: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      maybeCaptureGeo(); // traçabilité : localisation de l'agent au moment du scan
      try {
        const res = await checkInAction(eventId, code, geoRef.current ?? undefined);
        setResult({
          ...res,
          displayStatus: res.status,
          at: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        });
        if (navigator.vibrate) {
          if (res.status === CheckInStatus.VALID) navigator.vibrate(120);
          else navigator.vibrate([80, 60, 120]);
        }
      } catch {
        // Hors-ligne : on enregistre localement, la vérité sera le serveur à la sync.
        const offline = !navigator.onLine;
        if (offline) {
          await queueScan(code);
          setResult({
            status: CheckInStatus.INVALID,
            displayStatus: OFFLINE_QUEUED,
            message: "Pas de réseau : le scan est enregistré localement. Il sera vérifié à la synchronisation.",
            at: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          });
          if (navigator.vibrate) navigator.vibrate(60);
        } else {
          setResult({
            status: CheckInStatus.INVALID,
            displayStatus: CheckInStatus.INVALID,
            message: "Erreur de connexion. Réessayez.",
            at: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          });
        }
      } finally {
        busyRef.current = false;
        setBusy(false);
        setManual("");
      }
    },
    [eventId, queueScan, maybeCaptureGeo]
  );

  const startCamera = useCallback(async () => {
    if (cameraOn) return;
    try {
      // Import dynamique : évite d'exécuter html5-qrcode pendant le SSR.
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => {
          handleCode(decodedText);
        },
        () => {}
      );
      setCameraOn(true);
      setCameraError(false);
    } catch {
      setCameraError(true);
      setCameraOn(false);
    }
  }, [cameraOn, handleCode]);

  const stopCamera = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current
        .stop()
        .then(() => scannerRef.current?.clear())
        .catch(() => {});
      scannerRef.current = null;
      setCameraOn(false);
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const dismiss = () => setResult(null);
  const style = result ? RESULT_STYLE[result.displayStatus] : null;

  return (
    <div className="relative">
      {/* Bandeau hors-ligne / synchronisation */}
      {pending > 0 && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl border border-sky-700/60 bg-sky-950/60 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sky-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-sky-400" />
            </span>
            <span className="font-bold text-sky-300">
              {pending} scan{pending > 1 ? "s" : ""} hors-ligne
            </span>
          </div>
          <button
            type="button"
            onClick={syncQueue}
            disabled={syncing}
            className="shrink-0 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-sky-400 disabled:opacity-50"
          >
            {syncing ? "Sync…" : "Synchroniser"}
          </button>
        </div>
      )}
      {syncMsg && (
        <p className="mb-4 text-center text-xs font-semibold text-sky-400">{syncMsg}</p>
      )}

      {/* Zone caméra */}
      <div className="overflow-hidden rounded-2xl bg-slate-900">
        <div id="qr-reader" className={cameraOn ? "block" : "hidden"} />
        {!cameraOn && (
          <div className="grid aspect-square place-items-center p-8 text-center">
            {cameraError ? (
              <div>
                <p className="text-sm font-semibold text-amber-400">Caméra indisponible</p>
                <p className="mt-1 text-xs text-slate-500">
                  Utilisez la saisie manuelle ci-dessous, ou autorisez l&apos;accès à la caméra.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={startCamera}
                className="flex flex-col items-center gap-3 text-slate-300 transition hover:text-brand-400"
              >
                <svg className="h-10 w-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span className="text-sm font-bold">Activer la caméra</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Saisie manuelle */}
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) handleCode(manual.trim());
        }}
      >
        <input
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Ou saisir le code du billet (ex : VIP-4F2A9C)"
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition focus:border-brand-500"
        />
        <button
          type="submit"
          disabled={busy || !manual.trim()}
          className="shrink-0 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          Vérifier
        </button>
      </form>

      {/* Recherche par nom ou téléphone (client qui a perdu son billet) */}
      <div className="mt-4">
        <button
          type="button"
          onClick={() => setSearchOpen((o) => !o)}
          aria-expanded={searchOpen}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-bold text-slate-300 transition hover:border-brand-600 hover:text-brand-400"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
          Rechercher un billet (nom / téléphone)
        </button>

        {searchOpen && (
          <div className="animate-fade-up mt-2">
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!searchQuery.trim() || searching) return;
                setSearching(true);
                setSearchResults(null);
                try {
                  setSearchResults(await searchTicketsAction(eventId, searchQuery));
                } catch {
                  setSearchResults([]);
                } finally {
                  setSearching(false);
                }
              }}
            >
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nom ou numéro (ex : Aya, 97123456)"
                className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={searching || !searchQuery.trim()}
                className="shrink-0 rounded-xl bg-slate-700 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-600 disabled:opacity-40"
              >
                {searching ? "…" : "Chercher"}
              </button>
            </form>

            {searchResults && (
              <div className="mt-3 space-y-2">
                {searchResults.length === 0 ? (
                  <p className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-center text-xs text-slate-500">
                    Aucun billet trouvé pour cette recherche.
                  </p>
                ) : (
                  searchResults.map((t) => {
                    const entered = t.status === TicketStatus.ENTERED;
                    const blacklisted = t.status === TicketStatus.BLACKLISTED;
                    return (
                      <div
                        key={t.id}
                        className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                          blacklisted
                            ? "border-red-900/60 bg-red-950/40"
                            : entered
                              ? "border-brand-800 bg-brand-950/40"
                              : "border-slate-800 bg-slate-900"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-white">{t.guestName}</p>
                          <p className="truncate text-xs text-slate-400">
                            {t.category ?? "Billet"}
                            {t.guestPhone ? ` · ${displayPhone(t.guestPhone)}` : ""}
                          </p>
                          <span
                            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              blacklisted
                                ? "bg-red-500/20 text-red-400"
                                : entered
                                  ? "bg-brand-500/20 text-brand-400"
                                  : "bg-emerald-500/20 text-emerald-400"
                            }`}
                          >
                            {blacklisted
                              ? "Liste noire"
                              : entered
                                ? "Déjà utilisé"
                                : t.guestCount > 1 && t.entriesCount > 0
                                  ? `Entrée partielle ${t.entriesCount}/${t.guestCount}`
                                  : t.guestCount > 1
                                    ? `Invitation ${t.guestCount} pers.`
                                    : "Valide"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCode(t.code)}
                          disabled={busy || blacklisted || entered}
                          title={entered || blacklisted ? "Billet déjà traité" : "Valider l'entrée"}
                          className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Valider
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Indicateur d'activité */}
      {busy && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-slate-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          Vérification…
        </div>
      )}

      {/* Résultat plein écran */}
      {result && style && (
        <div className="animate-pop fixed inset-0 z-50 flex flex-col items-center justify-center p-8 text-center text-white">
          <div className={`absolute inset-0 ${style.bg}`} />
          <div className="relative flex w-full max-w-sm flex-col items-center">
            <div className={`grid h-24 w-24 place-items-center rounded-full bg-white/20 backdrop-blur ring-4 ${style.ring}`}>
              <svg className="h-12 w-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {STATUS_ICONS[result.displayStatus]}
              </svg>
            </div>
            <h2 className="mt-6 text-3xl font-extrabold">{style.title}</h2>
            {result.guestName && <p className="mt-1 text-lg font-semibold text-white/90">{result.guestName}</p>}
            {result.category && <p className="text-sm text-white/70">{result.category}</p>}
            {result.guestCount && result.guestCount > 1 && (
              <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-sm font-extrabold ring-1 ring-white/30">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                {Math.min(result.guestCount, result.entriesCount ?? 0)}/{result.guestCount} entrées
              </p>
            )}
            <p className="mt-3 max-w-xs text-sm text-white/80">{result.message}</p>
            <p className="mt-1 text-xs text-white/60">{result.at}</p>
            <button
              type="button"
              onClick={dismiss}
              className="mt-10 w-full rounded-2xl bg-white py-4 text-base font-extrabold text-slate-900 shadow-xl transition hover:-translate-y-0.5"
            >
              Nouveau scan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
