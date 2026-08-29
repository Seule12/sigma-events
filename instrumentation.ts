// Point d'entrée instrumentation Next.js (côté serveur uniquement).
// Charge la config Sentry serveur au démarrage du process Node.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }
}
