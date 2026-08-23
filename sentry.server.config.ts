// Configuration Sentry — côté serveur (API routes, actions, rendu).
// S'initialise UNIQUEMENT si SENTRY_DSN est défini : en local sans DSN,
// le SDK est inactif et le build n'est pas impacté.
//
// NB : on utilise @sentry/node (pas @sentry/nextjs) pour ne pas ralentir le
// build Turbopack avec le plugin du SDK Next. Les erreurs non rattrapées des
// API routes et actions sont captées via captureException dans lib/sentry.ts.
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV || process.env.NODE_ENV || "production",
    // Échantillonnage des transactions : 10 % suffit pour du monitoring
    // d'erreurs ; 100 % ne serait utile que pour du tracing détaillé.
    tracesSampleRate: 0.1,
  });
}

export { Sentry };
