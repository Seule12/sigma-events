import { NextResponse } from "next/server";
import { handleOAuthCallback, type OAuthProvider } from "@/lib/oauth";

// Callback OAuth : le fournisseur renvoie le navigateur ici après l'accord.
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${process.env.APP_URL || "http://localhost:3000"}/login?oauth=denied&provider=${provider}`
    );
  }
  if (!code || !state) {
    return NextResponse.redirect(
      `${process.env.APP_URL || "http://localhost:3000"}/login?oauth=error&provider=${provider}`
    );
  }

  try {
    const home = await handleOAuthCallback(provider as OAuthProvider, code, state);
    return NextResponse.redirect(`${process.env.APP_URL || "http://localhost:3000"}${home}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    const kind = message === "COMPTE_BLOQUE" ? "blocked" : "error";
    return NextResponse.redirect(
      `${process.env.APP_URL || "http://localhost:3000"}/login?oauth=${kind}&provider=${provider}`
    );
  }
}
