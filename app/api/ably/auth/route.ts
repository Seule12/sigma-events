import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ablyRest } from "@/lib/ably";
import { cookies } from "next/headers";

// Route d'authentification Ably pour le navigateur : émet un tokenRequest
// limité à la souscription du canal privé de l'utilisateur connecté.
// La clé API root ne quitte jamais le serveur (TokenAuth).
// Retourne 401 (non 500) si l'utilisateur n'est pas connecté, pour ne pas
// polluer les logs côté client (Ably auth error = silencieux).
export async function GET() {
  // Lecture discrète du cookie de session sans lever d'erreur.
  const cookieStore = await cookies();
  const sessionId = cookieStore.get("session")?.value ?? null;
  if (!sessionId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { userId: true },
  });
  if (!session) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  try {
    const tokenRequestData = await ablyRest().auth.createTokenRequest({
      clientId: session.userId,
      // Capacités minimales : lecture (souscription) sur son canal privé et les
      // canaux d'événements publics. Pas de publication depuis le navigateur.
      capability: {
        [`notif-${session.userId}`]: ["subscribe", "presence"],
        "*": ["subscribe"],
      },
      ttl: 60 * 60 * 1000, // 1 h
    });
    return NextResponse.json(tokenRequestData);
  } catch (e) {
    // Ably non configuré ou clé invalide : ne pas casser le flux.
    console.error("[ably/auth] erreur token request", e);
    return NextResponse.json({ error: "ably_error" }, { status: 503 });
  }
}
