// Configuration Sentry — côté navigateur (erreurs de rendu, exceptions JS).
// Même principe : inactif sans SENTRY_DSN.
"use client";

import * as Sentry from "@sentry/browser";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENV || "production",
    tracesSampleRate: 0.1,
  });
}

export { Sentry };
