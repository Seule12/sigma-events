// Sigma Events — Service Worker (PWA)
// Objectif : rendre l'application installable et utilisable sans réseau
// (l'app de scan se charge hors-ligne si déjà visitée ; les scans sont
// mis en file d'attente par l'application puis synchronisés à la reconnexion).

const VERSION = "sigma-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

// Fichiers du shell (chargés à l'installation, hors-ligne d'office).
const PRECACHE = ["/", "/manifest.webmanifest", "/sigma-logo.png", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // les actions serveur (POST) passent normalement

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // on ne cache pas les domaines tiers

  // Navigations (pages) : réseau d'abord, sinon cache, sinon page d'accueil en cache.
  // ⚠️ Les pages authentifiées (dashboard, événements, scan) peuvent être mises en cache
  // pour permettre l'accès initial hors-ligne, mais les données sensibles sont gérées
  // par le stockage IndexedDB et non par le cache HTTP.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // On cache tout, y compris les pages auth, pour le shell PWA.
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => {
          return caches
            .match(request)
            .then((cached) => cached || caches.match("/") || caches.match("/login"));
        })
    );
    return;
  }

  // Assets (JS/CSS/images) : cache d'abord, sinon réseau puis mise en cache.
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request)
          .then((response) => {
            if (response.ok && url.pathname.startsWith("/_next/")) {
              const copy = response.clone();
              caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
            }
            return response;
          })
          .catch(() => cached)
    )
  );
});
