// Error boundary de segment (App Router) : erreurs de rendu dans une page.
"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Client Error]", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        textAlign: "center",
        padding: "2rem",
        gap: "0.75rem",
      }}
    >
      <h1 style={{ fontSize: "1.25rem", fontWeight: 700 }}>Oups, une erreur est survenue</h1>
      <p style={{ color: "#64748b" }}>
        Recharge la page pour réessayer.
      </p>
      <button
        onClick={reset}
        style={{
          background: "#22c55e",
          color: "#052e16",
          border: "none",
          borderRadius: "0.5rem",
          padding: "0.6rem 1.25rem",
          fontSize: "0.95rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Réessayer
      </button>
    </div>
  );
}
