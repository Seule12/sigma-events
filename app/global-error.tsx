// Error boundary racine (App Router) : capture toute erreur de rendu non rattrapée.
"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Global Error]", error);
  }, [error]);

  return (
    <html lang="fr">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#0f172a", color: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: "2rem", maxWidth: 480 }}>
          <h1 style={{ fontSize: "1.5rem", marginBottom: "0.75rem" }}>Oups, une erreur est survenue</h1>
          <p style={{ color: "#94a3b8", marginBottom: "1.5rem" }}>
            Recharge la page pour réessayer.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#22c55e",
              color: "#052e16",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.75rem 1.5rem",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Réessayer
          </button>
        </div>
      </body>
    </html>
  );
}
