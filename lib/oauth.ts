import "server-only";

import { cookies } from "next/headers";
import { createSession, roleHome } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// ============================================================
// Connexion sociale (OAuth 2.0 — Authorization Code + PKCE)
// Fournisseurs : Google (et Apple, désactivé par défaut). Facebook a été
// retiré — seul Google est proposé à la création de compte.
// Les comptes créés via un fournisseur n'ont ni téléphone ni PIN :
//  - phone / pin sont NULL (login téléphone impossible sur ce compte)
//  - email (unique) + authProvider + providerId identifient le compte
//  - une session cookie « maison » (sigma_session) est créée comme pour
//    un login classique → l'écosystème existant (rôles, blocage admin,
//    sessions) fonctionne sans changement.
// ============================================================

export type OAuthProvider = "google" | "apple";

export const OAUTH_PROVIDERS: Record<
  OAuthProvider,
  {
    label: string;
    enabled: boolean;
    authUrl: string;
    tokenUrl: string;
    userInfoUrl: string | null; // null → profil lu depuis le jeton (Apple)
    scope: string;
    clientIdEnv: string;
    clientSecretEnv: string;
  }
> = {
  google: {
    label: "Google",
    enabled: !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET,
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    scope: "openid email profile",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
  },
  apple: {
    label: "Apple",
    // Le secret Apple est un JWT ES256 signé avec la clé .p8 (voir clientSecret()).
    enabled:
      !!process.env.APPLE_CLIENT_ID &&
      !!process.env.APPLE_KEY_ID &&
      !!process.env.APPLE_TEAM_ID &&
      !!process.env.APPLE_PRIVATE_KEY,
    authUrl: "https://appleid.apple.com/auth/authorize",
    tokenUrl: "https://appleid.apple.com/auth/token",
    userInfoUrl: null, // profil lu depuis l'id_token (JWT)
    scope: "name email",
    clientIdEnv: "APPLE_CLIENT_ID",
    clientSecretEnv: "APPLE_CLIENT_SECRET",
  },
};

const APP_URL = process.env.APP_URL || "http://localhost:3000";

export function providerConfig(provider: OAuthProvider) {
  return OAUTH_PROVIDERS[provider];
}

// URL de rappel déclarée dans la console du fournisseur.
export function redirectUri(provider: OAuthProvider): string {
  return `${APP_URL}/api/auth/${provider}/callback`;
}

function randomString(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// PKCE S256 : le code_challenge est le SHA-256 (base64url) du code_verifier.
// Le verifier est stocké dans un cookie httpOnly — il ne voyage JAMAIS dans
// l'URL (un verifier visible dans l'historique / les référents n'a plus de
// valeur de preuve). Seul le challenge (irréversible) part au fournisseur.
function base64Url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  return Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(data: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
  return base64Url(digest);
}

// State + PKCE verifier stockés dans un cookie httpOnly court : protège le
// callback contre le CSRF (state) et contre l'interception du verifier (PKCE).
export async function stashState(state: string, verifier?: string): Promise<void> {
  const store = await cookies();
  store.set("sigma_oauth_state", JSON.stringify({ state, verifier }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60, // 10 min
    path: "/",
  });
}

export async function takeState(): Promise<{ state: string; verifier: string | null } | null> {
  const store = await cookies();
  const raw = store.get("sigma_oauth_state")?.value ?? null;
  store.delete("sigma_oauth_state");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { state?: string; verifier?: string };
    if (typeof parsed.state !== "string") return null;
    return { state: parsed.state, verifier: typeof parsed.verifier === "string" ? parsed.verifier : null };
  } catch {
    // Ancien format (state nu, sans PKCE) — toléré en lecture.
    return { state: raw, verifier: null };
  }
}

// ============================================================
// Étape 1 — génère l'URL d'autorisation (redirection navigateur)
// ============================================================
export async function buildAuthUrl(provider: OAuthProvider): Promise<string> {
  const cfg = providerConfig(provider);
  const state = randomString(16);
  // Verifier aléatoire (43-128 chars, alphabet PKCE) — jamais exposé dans l'URL.
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(64)), (b) => alphabet[b % alphabet.length]).join("");
  const challenge = await sha256(verifier); // S256 : irréversible
  await stashState(state, verifier);

  const params = new URLSearchParams({
    client_id: process.env[cfg.clientIdEnv]!,
    redirect_uri: redirectUri(provider),
    response_type: "code",
    scope: cfg.scope,
    state,
    ...(provider === "google" || provider === "apple"
      ? { code_challenge: challenge, code_challenge_method: "S256" }
      : {}),
    ...(provider === "apple" ? { response_mode: "query" } : {}),
  });
  return `${cfg.authUrl}?${params.toString()}`;
}

// ============================================================
// Étape 2 — échange le code contre un token d'accès
// ============================================================
export type OAuthProfile = {
  provider: OAuthProvider;
  providerId: string;
  name: string;
  email: string | null;
};

async function exchangeCode(provider: OAuthProvider, code: string, verifier: string): Promise<string> {
  const cfg = providerConfig(provider);
  const body = new URLSearchParams({
    client_id: process.env[cfg.clientIdEnv]!,
    client_secret: await clientSecret(provider),
    code,
    redirect_uri: redirectUri(provider),
    grant_type: "authorization_code",
    ...(provider === "google" || provider === "apple" ? { code_verifier: verifier } : {}),
  });
  const res = await fetch(cfg.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error?: string };
  if (!res.ok || !data.access_token) {
    throw new Error(`OAuth token échec ${provider}: ${data.error ?? res.status}`);
  }
  return data.access_token;
}

// Client secret Apple : JWT ES256 signé avec la clé .p8 (durée de vie 6 mois max).
async function clientSecret(provider: OAuthProvider): Promise<string> {
  if (provider !== "apple") return process.env[providerConfig(provider).clientSecretEnv]!;
  const { SignJWT, importPKCS8 } = await import("jose");
  const key = await importPKCS8(process.env.APPLE_PRIVATE_KEY!, "ES256");
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: process.env.APPLE_KEY_ID! })
    .setIssuer(process.env.APPLE_TEAM_ID!)
    .setIssuedAt()
    .setExpirationTime("6 months")
    .setAudience("https://appleid.apple.com")
    .setSubject(process.env.APPLE_CLIENT_ID!)
    .sign(key);
}

async function fetchProfile(provider: OAuthProvider, accessToken: string): Promise<OAuthProfile> {
  const cfg = providerConfig(provider);
  if (provider === "apple") {
    // Apple ne renvoie pas de userinfo : l'identité est dans l'id_token (JWT).
    const parts = accessToken.split(".");
    if (parts.length !== 3) throw new Error("OAuth apple : jeton inattendu");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      sub: string;
      email?: string;
      name?: string;
    };
    return { provider, providerId: payload.sub, name: payload.name || "Utilisateur Apple", email: payload.email ?? null };
  }
  const res = await fetch(cfg.userInfoUrl!, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = (await res.json().catch(() => ({}))) as {
    id?: string;
    sub?: string;
    name?: string;
    email?: string;
  };
  if (!res.ok || (!data.id && !data.sub)) throw new Error(`OAuth profil échec ${provider}`);
  return {
    provider,
    providerId: data.id ?? data.sub!,
    name: data.name || "Utilisateur",
    email: data.email ?? null,
  };
}

// ============================================================
// Étape 3 — callback : vérifie le state, échange, upsert, session
// ============================================================
export async function handleOAuthCallback(provider: OAuthProvider, code: string, state: string) {
  const expected = await takeState();
  // Comparaison EXACTE du state (et non un préfixe) : un état partiel ou altéré
  // est rejeté. Le verifier PKCE vient du cookie httpOnly, jamais de l'URL.
  if (!expected || expected.state !== state) {
    throw new Error("state invalide — demande expirée ou altérée");
  }
  if (!expected.verifier) {
    throw new Error("verifier manquant — PKCE obligatoire");
  }
  const accessToken = await exchangeCode(provider, code, expected.verifier);
  const profile = await fetchProfile(provider, accessToken);

  // Un compte existant chez ce fournisseur → connexion.
  let user = await prisma.user.findFirst({
    where: { authProvider: profile.provider.toUpperCase(), providerId: profile.providerId },
  });
  // Même email mais compte « téléphone » (créé avant) → on lie l'identité sociale.
  if (!user && profile.email) {
    user = await prisma.user.findUnique({ where: { email: profile.email } });
    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { authProvider: profile.provider.toUpperCase(), providerId: profile.providerId },
      });
    }
  }
  if (!user) {
    // Nouveau compte : organisateur par défaut, sans téléphone ni PIN (login social).
    user = await prisma.user.create({
      data: {
        name: profile.name,
        email: profile.email,
        authProvider: profile.provider.toUpperCase(),
        providerId: profile.providerId,
        pin: null, // connexion via le fournisseur uniquement
        role: "ORGANIZER",
      },
    });
  }
  if (user.active === false) throw new Error("COMPTE_BLOQUE");

  await createSession(user.id);
  return roleHome(user.role as "ORGANIZER" | "AGENT" | "SUPER_ADMIN");
}
