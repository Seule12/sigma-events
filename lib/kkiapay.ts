// Paiement mobile money réel — passerelle KKIAPAY (kkiapay.me, Bénin).
//
// - Réseaux : MTN MoMo / Moov Money / Celtiis Cash via le widget
//   client KKIAPAY (https://cdn.kkiapay.me/k.js) + vérification côté serveur.
// - Mode sandbox (par défaut) : numéros de test KKIAPAY pour simuler les
//   scénarios (ex. 61000000 = succès MTN Bénin, 68000000 = succès Moov).
// - Docs : https://docs.kkiapay.me — SDK Node : @kkiapay-org/nodejs-sdk
//
// Flux réel :
//   1. la page de paiement charge le widget et ouvre openKkiapayWidget
//      ({ amount, key, sandbox, phone, name, email, callback, partnerId, … })
//   2. le client paie (mobile money) dans le widget
//   3. KKIAPAY redirige vers `callback` (= /acheter/confirmation/<orderId>)
//   4. le webhook /api/webhook/kkiapay notifie le backend (header
//      `x-kkiapay-secret`) avec { transactionId, isPaymentSucces, amount, … }
//   5. le serveur appelle l'API de vérification (autorité anti-fraude) :
//      POST /api/v1/transactions/status { transactionId } → status SUCCESS
//      + montant exact → la commande est confirmée (émission des billets QR).

import crypto from "node:crypto";
import { clientTotal } from "@/lib/shop";

const KKIA_API_BASE_SANDBOX = "https://api-sandbox.kkiapay.me";
const KKIA_API_BASE_LIVE = "https://api.kkiapay.me";

// Les noms historiques du .env (env.txt : Publique_API_key / Private_API_KEY /
// Secret) sont gardés en fallback pour ne pas casser la configuration existante.
function env(key: string, fallbackKey?: string): string {
  return process.env[key] || (fallbackKey ? process.env[fallbackKey] : undefined) || "";
}

export type KkiapayConfig = {
  publicKey: string;
  privateKey: string;
  secretKey: string;
  sandbox: boolean;
  webhookSecret: string;
};

export function kkiapayConfig(): KkiapayConfig {
  const publicKey = env("KKIA_PUBLIC_KEY", "Publique_API_key");
  const privateKey = env("KKIA_PRIVATE_KEY", "Private_API_KEY");
  const secretKey = env("KKIA_SECRET_KEY", "Secret");
  // Sandbox par défaut : les clés de test commencent par tpk_ / tsk_ et le
  // sandbox est le mode recommandé tant que KKIA_SANDBOX n'est pas "false".
  const sandbox = (process.env.KKIA_SANDBOX ?? "true") !== "false";
  const webhookSecret = env("KKIA_WEBHOOK_SECRET") || secretKey;
  return { publicKey, privateKey, secretKey, sandbox, webhookSecret };
}

// La passerelle est opérationnelle quand les 3 clés (publique, privée, secrète)
// sont renseignées. Sans elles : paiement simulé (mode démo), comme Dodo.
export function isKkiapayEnabled(): boolean {
  const { publicKey, privateKey, secretKey } = kkiapayConfig();
  return Boolean(publicKey && privateKey && secretKey);
}

// Mode TEST (sandbox) : vrai tant que KKIA_SANDBOX n'est pas explicitement
// "false" (clés de test tpk_/tsk_ présentes). Sert de garde-fou pour les
// fonctions de secours temporaires, à retirer au passage en production.
export function isKkiapaySandbox(): boolean {
  return kkiapayConfig().sandbox;
}

export function kkiapayApiBase(): string {
  return kkiapayConfig().sandbox ? KKIA_API_BASE_SANDBOX : KKIA_API_BASE_LIVE;
}

export type KkiapayVerifiedTransaction = {
  status: string; // "SUCCESS" | "FAILED" | …
  amount: number; // FCFA (unité majeure)
  transactionId: string;
};

// Vérification serveur d'une transaction — L'AUTORITÉ anti-fraude.
// POST {base}/api/v1/transactions/status avec les 3 clés en en-têtes.
// Le webhook seul ne suffit jamais : seule une transaction vérifiée SUCCESS
// avec le bon montant peut confirmer une commande.
export async function verifyKkiapayTransaction(
  transactionId: string
): Promise<KkiapayVerifiedTransaction | null> {
  const { publicKey, privateKey, secretKey } = kkiapayConfig();
  if (!publicKey || !privateKey || !secretKey) return null;
  try {
    const res = await fetch(`${kkiapayApiBase()}/api/v1/transactions/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": publicKey,
        "x-private-key": privateKey,
        "x-secret-key": secretKey,
      },
      body: JSON.stringify({ transactionId }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: string;
      amount?: number;
      transactionId?: string;
    };
    return {
      status: String(data.status ?? "").toUpperCase(),
      amount: Number(data.amount) || 0,
      transactionId: String(data.transactionId ?? transactionId),
    };
  } catch {
    return null;
  }
}

// Vérifie la signature du webhook (`x-kkiapay-secret`).
// La doc indique que l'en-tête contient le secret hash configuré dans le
// dashboard (comparaison directe) ; on accepte aussi un HMAC-SHA256 du body
// (certains intégrateurs signent ainsi). Dans tous les cas, la vraie sécurité
// vient de verifyKkiapayTransaction() : sans SUCCESS serveur + montant exact,
// aucun paiement n'est confirmé (le webhook peut être rejoué ou forgé).
export function verifyKkiapayWebhookSignature(
  rawBody: string,
  secretHeader: string | null
): boolean {
  const { webhookSecret } = kkiapayConfig();
  if (!secretHeader || !webhookSecret) return false;
  try {
    // 1. Comparaison directe (le header contient le secret hash).
    const a = Buffer.from(secretHeader.trim());
    const b = Buffer.from(webhookSecret);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
    // 2. Fallback HMAC-SHA256(body, secret) en hex.
    const hmac = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    const e = Buffer.from(hmac);
    const f = Buffer.from(secretHeader.trim());
    if (e.length === f.length && crypto.timingSafeEqual(e, f)) return true;
  } catch {
    /* format invalide → rejet */
  }
  return false;
}

// Rembourse une transaction mobile money (POST /api/v1/transactions/revert).
// Utilisé quand le paiement est valide mais que la commande ne peut plus être
// confirmée (capacité dépassée, commande expirée…) : le client n'est jamais
// laissé sans billet ET sans remboursement.
export async function refundKkiapayTransaction(transactionId: string): Promise<boolean> {
  const { publicKey, privateKey, secretKey } = kkiapayConfig();
  if (!publicKey || !privateKey || !secretKey) return false;
  try {
    const res = await fetch(`${kkiapayApiBase()}/api/v1/transactions/revert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": publicKey,
        "x-private-key": privateKey,
        "x-secret-key": secretKey,
      },
      body: JSON.stringify({ transactionId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Montant à débiter pour la commande : (billets + frais de livraison) gross-up
// FedaPay — le client paie un prix tout compris (commission FedaPay intégrée).
// Cf. lib/shop.ts (grossUpFedaPay / clientTotal) pour le modèle économique.
export function kkiapayAmount(order: { amount: number; deliveryFee?: number | null }): number {
  return clientTotal(order);
}
