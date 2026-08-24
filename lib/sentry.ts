// Helper Sentry — DÉSACTIVÉ (pas de packages @sentry/* installés).
// Pour activer : npm install @sentry/node, puis restaurer la version complète.

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  // no-op sans Sentry
  console.error("[Error]", error, context);
}

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
