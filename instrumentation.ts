// Point d'entrée instrumentation Next.js (côté serveur uniquement).
// Sentry est désactivé — les packages ne sont pas installés.
// Pour activer : npm install @sentry/node @sentry/browser, puis décommenter.
//
// export async function register() {
//   if (process.env.NEXT_RUNTIME === "nodejs") {
//     await import("./sentry.server.config");
//   }
// }
export async function register() {
  // no-op: Sentry désactivé (pas de SENTRY_DSN ni de packages @sentry/*)
}
