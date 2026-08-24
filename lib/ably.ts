import "server-only";
import Ably from "ably";

// Client Ably côté serveur (REST) : publie des notifications temps réel sur le
// canal privé de chaque utilisateur. La clé API est fournie via l'env ABLY_API_KEY.
let rest: Ably.Rest | null = null;

export function ablyRest(): Ably.Rest {
  if (!process.env.ABLY_API_KEY) {
    throw new Error("ABLY_API_KEY manquante — renseignez-la dans .env pour activer le temps réel.");
  }
  if (!rest) {
    rest = new Ably.Rest(process.env.ABLY_API_KEY);
  }
  return rest;
}

export type LiveNotification = {
  kind: "gauge" | "payment" | "tickets" | "checkin" | "alert";
  title: string;
  desc: string;
  href?: string;
  at: number; // epoch ms
};

// Publie une notification sur le canal temps réel de l'utilisateur
// (canal privé « notif-<userId> », souscrit côté client via /api/ably/auth).
export async function publishLiveNotification(
  userId: string,
  notification: Omit<LiveNotification, "at">
): Promise<void> {
  try {
    const channel = ablyRest().channels.get(`notif-${userId}`);
    await channel.publish("notification", {
      ...notification,
      at: Date.now(),
    } satisfies LiveNotification);
  } catch (e) {
    // Le temps réel ne doit jamais casser le flux métier (paiement, scan…).
    console.error("[ably] notification non publiée", e);
  }
}

// Canal public de l'événement : compteurs de jauge et entrées en direct
// (utilisé par les pages événement / admin pour rafraîchir sans recharger).
export async function publishEventUpdate(eventId: string, data: Record<string, unknown>): Promise<void> {
  try {
    const channel = ablyRest().channels.get(`event-${eventId}`);
    await channel.publish("update", data);
  } catch (e) {
    console.error("[ably] update événement non publié", e);
  }
}
