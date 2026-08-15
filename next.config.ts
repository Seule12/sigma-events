import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Modules natifs (binaires better-sqlite3, pg) : chargés à l'exécution côté
  // serveur, jamais bundlés par Next.js/Turbopack. Les deux adaptateurs Prisma
  // (SQLite dev + Postgres prod) peuvent ainsi coexister sans erreur de build.
  serverExternalPackages: ["better-sqlite3", "pg", "@prisma/adapter-better-sqlite3", "@prisma/adapter-pg"],

  // En-têtes de sécurité (durcissement) : une plateforme de sécurité se doit
  // d'envoyer ces headers sur TOUTES les réponses, y compris les erreurs.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Empêche le clickjacking : refus d'embarquer le site dans une iframe.
          { key: "X-Frame-Options", value: "DENY" },
          // Force le navigateur à respecter le type MIME déclaré (anti-sniffing).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Ne révèle pas le numéro de version du serveur.
          { key: "X-Powered-By", value: "" },
          // Referrer limité au même site (les clés/refs de la plateforme ne
          // fuient pas via le Referer vers les fournisseurs tiers).
          { key: "Referrer-Policy", value: "same-origin" },
          // Restreint les API navigateur (géolocalisation, caméra…) à ce qui
          // est réellement utilisé : caméra pour le scan, géo pour les scans.
          {
            key: "Permissions-Policy",
            value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=()",
          },
          // HSTS (https uniquement) en production.
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
        ],
      },
    ];
  },
};

export default nextConfig;
