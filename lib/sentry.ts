// Helper Sentry serveur — capture d'erreurs dans les API routes et actions.
// Inactif si SENTRY_DSN n'est pas défini (dev local, tests CI).
import * as Sentry from "@sentry/node";

// Initialise le SDK une seule fois (idempotent si déjà fait par
// sentry.server.config.ts via instrumentation.ts).
const dsn = process.env.SENTRY_DSN;
if (dsn && !Sentry.getClient()) {
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENV || process.env.NODE_ENV || "production",
    tracesSampleRate: 0.1,
  });
}

/**
 * Capture une erreur côté serveur et renvoie l'erreur inchangée
 * (pour les `catch (e) { captureError(e); return … }`).
 */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!dsn) return; // no-op sans Sentry
  if (context) {
    Sentry.withScope((scope) => {
      scope.setExtras(context);
      Sentry.captureException(error);
    });
  } else {
    Sentry.captureException(error);
  }
}

export { Sentry };

/**
 * Wrapper de route handler : capture l'erreur dans Sentry puis la relance
 * (Next.js répondra 500). À appliquer sur les routes API critiques :
 *   export const POST = withErrorCapture(async (req) => { … });
 */
export function withErrorCapture<T extends unknown[]>(handler: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (e) {
      captureError(e, { route: "api" });
      throw e;
    }
  };
}
