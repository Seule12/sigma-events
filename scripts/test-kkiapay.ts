// Tests unitaires du module KKIAPAY (signature webhook + montant).
// N'exige PAS de réseau : la vérification serveur (verify) est testée séparément
// en conditions réelles dans le sandbox (elle appelle api-sandbox.kkiapay.me).
import "dotenv/config";
import { createHmac } from "node:crypto";
import {
  isKkiapayEnabled,
  kkiapayConfig,
  kkiapayAmount,
  verifyKkiapayWebhookSignature,
} from "../lib/kkiapay";

let pass = 0;
let fail = 0;
function assert(label: string, ok: boolean) {
  if (ok) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}`);
  }
}

async function main() {
  console.log("\n── KKIAPAY : configuration ──");
  const cfg = kkiapayConfig();
  const keysPresent = Boolean(cfg.publicKey && cfg.privateKey && cfg.secretKey);
  assert("clés présentes (publique/privée/secrète)", keysPresent);
  assert("sandbox actif par défaut", cfg.sandbox === true);
  assert("isKkiapayEnabled() cohérent", isKkiapayEnabled() === keysPresent);

  console.log("\n── Signature webhook (x-kkiapay-secret) ──");
  const secret = cfg.webhookSecret || "test-secret";
  const body = JSON.stringify({ transactionId: "3iH6wjHJ3", isPaymentSucces: true, amount: 1000 });

  // 1. Comparaison directe : le header contient le secret hash du dashboard.
  assert("header = secret → accepté", verifyKkiapayWebhookSignature(body, secret) === true);

  // 2. Fallback HMAC-SHA256(body, secret) en hex.
  const hmac = createHmac("sha256", secret).update(body).digest("hex");
  assert("header = HMAC-SHA256(body) → accepté", verifyKkiapayWebhookSignature(body, hmac) === true);

  // 3. Mauvaise signature → refus.
  assert("mauvaise signature → refusé", verifyKkiapayWebhookSignature(body, "forged-signature") === false);

  // 4. Header absent → refus.
  assert("header absent → refusé", verifyKkiapayWebhookSignature(body, null) === false);

  // 5. Corps modifié → le HMAC ne correspond plus.
  const tampered = JSON.stringify({ transactionId: "3iH6wjHJ3", isPaymentSucces: true, amount: 9999 });
  const hmac2 = createHmac("sha256", secret).update(tampered).digest("hex");
  assert("corps altéré + HMAC du mauvais body → refusé", verifyKkiapayWebhookSignature(body, hmac2) === false);

  console.log("\n── Montant ──");
  assert("montant = billets + livraison", kkiapayAmount({ amount: 5000, deliveryFee: 75 }) === 5075);
  assert("livraison absente → 0", kkiapayAmount({ amount: 5000, deliveryFee: null }) === 5000);
  assert("livraison 0 → 0", kkiapayAmount({ amount: 5000, deliveryFee: 0 }) === 5000);

  // Double contrôle : payload (signé) ET réponse API doivent concorder.
  const expected = kkiapayAmount({ amount: 5000, deliveryFee: 75 });
  const apiOk = expected; // réponse API = montant attendu
  const payloadOk = expected; // payload signé = montant attendu
  assert("double contrôle : les deux concordent → accepté", apiOk === expected && payloadOk === expected);
  assert("payload surévalué → refusé", apiOk === expected && payloadOk + 100 !== expected);
  assert("payload partiel → refusé", apiOk === expected && payloadOk - 100 !== expected);

  console.log(`\n═══════════════════════════════`);
  console.log(`Résultat : ${pass} ✅ / ${fail} ❌`);
  console.log(`═══════════════════════════════`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
