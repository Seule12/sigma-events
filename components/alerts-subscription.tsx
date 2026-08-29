"use client";

import { useEffect, useRef, useCallback } from "react";
import * as Ably from "ably";

/**
 * Souscription Ably aux alertes temps réel pour le Command Center.
 * Écoute le canal "alerts" et déclenche un callback quand une nouvelle alerte arrive.
 */
export default function AlertsSubscription({
  onNewAlert,
}: {
  onNewAlert: () => void;
}) {
  const clientRef = useRef<Ably.Realtime | null>(null);
  const onNewAlertRef = useRef(onNewAlert);
  onNewAlertRef.current = onNewAlert;

  const connect = useCallback(async () => {
    try {
      const res = await fetch("/api/ably/auth", { cache: "no-store" });
      if (!res.ok || res.status === 401) return;
      const token = await res.json();
      if (!token || token.error) return;

      const client = new Ably.Realtime({
        authCallback: (_data, cb) => cb(null, token),
      });
      clientRef.current = client;

      const channel = client.channels.get("alerts");
      await channel.subscribe("new", () => {
        onNewAlertRef.current();
      });
    } catch {
      /* Ably non disponible : polling seul */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      if (!cancelled) await connect();
    };
    init();

    return () => {
      cancelled = true;
      clientRef.current?.close();
    };
  }, [connect]);

  return null; // Composant silencieux
}
