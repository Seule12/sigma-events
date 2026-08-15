import { NextResponse } from "next/server";
import { buildAuthUrl, providerConfig, type OAuthProvider } from "@/lib/oauth";

// Démarre le flux OAuth : redirige le navigateur vers l'écran du fournisseur.
// buildAuthUrl stocke lui-même le state (jeton anti-CSRF) + le code_verifier
// PKCE dans un cookie httpOnly — le verifier ne voyage jamais dans l'URL.
export async function GET(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const cfg = providerConfig(provider as OAuthProvider);
  if (!cfg) return NextResponse.json({ error: "Fournisseur inconnu" }, { status: 400 });
  if (!cfg.enabled) {
    return NextResponse.json(
      { error: `Connexion ${cfg.label} non configurée — renseignez ${cfg.clientIdEnv} et ${cfg.clientSecretEnv} dans .env` },
      { status: 501 }
    );
  }
  return NextResponse.redirect(await buildAuthUrl(provider as OAuthProvider));
}
