// Payouts FedaPay — virement du solde de l'organisateur vers son compte mobile money.
//
// - Sandbox (défaut) : https://sandbox-api.fedapay.com/v1 — aucun fonds réel.
// - Live : FEDAPAY_ENV="live" → https://api.fedapay.com/v1 (fonds réels !).
// Actif uniquement si FEDAPAY_SECRET_KEY est configuré ; sinon l'admin ne peut
// pas lancer de virement (la validation reste possible « hors ligne » ? NON — le
// virement FedaPay est obligatoire pour marquer un retrait comme versé).
//
// Docs : https://docs-v1.fedapay.com/payments/payouts
//   POST /payouts       → crée le dépôt (statut pending)
//   PUT  /payouts/start → déclenche le virement
//   GET  /payouts/:id   → statut du dépôt (sent / failed / …)

const FEDAPAY_SANDBOX = "https://sandbox-api.fedapay.com/v1";
const FEDAPAY_LIVE = "https://api.fedapay.com/v1";

export function isFedaPayPayoutEnabled(): boolean {
  return Boolean(process.env.FEDAPAY_SECRET_KEY);
}

export function fedapayBaseUrl(): string {
  return process.env.FEDAPAY_ENV === "live" ? FEDAPAY_LIVE : FEDAPAY_SANDBOX;
}

// Réseau mobile money (lib/momo.ts) → mode FedaPay attendu.
export function fedapayModeForNetwork(network?: string | null): string {
  switch (network) {
    case "MOOV_MONEY":
      return "moov";
    case "CELTIIS":
      return "sbin";
    case "MTN_MOMO":
    default:
      return "mtn_open";
  }
}

export type CreateFedaPayPayoutInput = {
  amount: number; // FCFA (XOF), entier
  customerName: string;
  phone: string; // format E.164 (+229XXXXXXXX, +225XXXXXXXXXX…)
  network: string; // MTN_MOMO | MOOV_MONEY | CELTIIS
};

export type FedaPayPayoutResult = { id: string; status: string };

// Crée le dépôt chez FedaPay (statut pending) — ne déclenche pas encore le virement.
export async function createFedaPayPayout(input: CreateFedaPayPayoutInput): Promise<FedaPayPayoutResult> {
  const key = process.env.FEDAPAY_SECRET_KEY;
  if (!key) throw new Error("FEDAPAY_SECRET_KEY non configuré.");
  const mode = fedapayModeForNetwork(input.network);
  const [firstname, lastname] = splitName(input.customerName);
  const body = {
    amount: input.amount,
    currency: { iso: "XOF" },
    mode,
    customer: {
      firstname,
      lastname,
      phone_number: { number: input.phone, country: "bj" },
    },
  };
  const res = await fetch(`${fedapayBaseUrl()}/payouts`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`FedaPay createPayout ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id?: string | number; status?: string };
  if (!data.id) throw new Error("FedaPay createPayout : réponse incomplète (id manquant)");
  return { id: String(data.id), status: data.status ?? "pending" };
}

// Déclenche le virement d'un ou plusieurs dépôts déjà créés.
export async function startFedaPayPayouts(ids: string[]): Promise<void> {
  const key = process.env.FEDAPAY_SECRET_KEY;
  if (!key) throw new Error("FEDAPAY_SECRET_KEY non configuré.");
  if (ids.length === 0) return;
  const res = await fetch(`${fedapayBaseUrl()}/payouts/start`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ payouts: ids.map((id) => ({ id: Number(id) })) }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`FedaPay startPayouts ${res.status}: ${detail.slice(0, 200)}`);
  }
}

// Statut d'un dépôt FedaPay (pending / started / processing / sent / failed).
export async function getFedaPayPayoutStatus(id: string): Promise<string> {
  const key = process.env.FEDAPAY_SECRET_KEY;
  if (!key) throw new Error("FEDAPAY_SECRET_KEY non configuré.");
  try {
    const res = await fetch(`${fedapayBaseUrl()}/payouts/${id}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return "unknown";
    const data = (await res.json()) as { status?: string };
    return data.status ?? "unknown";
  } catch {
    return "unknown";
  }
}

function splitName(full: string): [string, string] {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return [parts[0] || "Organisateur", "Sigma"];
  return [parts[0], parts.slice(1).join(" ")];
}
