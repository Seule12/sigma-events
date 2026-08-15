import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { ablyRest } from "@/lib/ably";

// Route d'authentification Ably pour le navigateur : émet un tokenRequest
// limité à la souscription du canal privé de l'utilisateur connecté.
// La clé API root ne quitte jamais le serveur (TokenAuth).
export async function GET() {
  const user = await requireUser();
  const tokenRequestData = await ablyRest().auth.createTokenRequest({
    clientId: user.id,
    // Capacités minimales : lecture (souscription) sur son canal privé et les
    // canaux d'événements publics. Pas de publication depuis le navigateur.
    capability: {
      [`notif-${user.id}`]: ["subscribe", "presence"],
      "*": ["subscribe"],
    },
    ttl: 60 * 60 * 1000, // 1 h
  });
  return NextResponse.json(tokenRequestData);
}
