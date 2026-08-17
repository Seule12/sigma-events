// Gestion centralisée des numéros de téléphone — ouvert à toute l'Afrique.
//
// Principe :
//  - Les numéros sont stockés en format « national » (sans +, sans 00), mais
//    AVEC leur indicatif pays quand il est connu. Pour le Bénin (indicatif 229)
//    on conserve le format historique (numéro national seul, ex. 97000000) pour
//    ne pas casser les comptes existants ; les autres pays gardent leur
//    indicatif (ex. 2250707070707 pour la Côte d'Ivoire).
//  - normalizePhone : saisie libre → format stocké (retire +, 00, espaces, tirets).
//  - toE164 / displayPhone / waDigits : format stocké → usage (SMS, WhatsApp,
//    affichage). Le Bénin est le pays par défaut quand aucun indicatif n'est
//    présent (rétrocompatibilité).

// Indicatif par défaut quand le numéro n'en a pas (historique : Bénin).
export const DEFAULT_COUNTRY_CODE = "229";

/** Chiffres bruts d'un numéro (retire +, 00, espaces, tirets, parenthèses). */
export function phoneDigits(p: string): string {
  return p.replace(/\D/g, "");
}

/**
 * Normalise une saisie libre vers le format stocké :
 *  - retire +229 / 00229 / espaces / tirets (numéro béninois → national seul)
 *  - retire + / 00 d'un autre indicatif mais CONSERVE l'indicatif (ex. +225… → 225…)
 *  - numéro national seul (sans indicatif) → tel quel (défaut Bénin)
 */
export function normalizePhone(p: string): string {
  const raw = p.trim();
  const hasLeadingPlus = raw.startsWith("+");
  const digits = phoneDigits(raw);
  if (digits.startsWith("00229")) return digits.slice(5); // 00229XXXXXXXX → XXXXXXXXX
  if (digits.startsWith("229") && digits.length > 9) return digits.slice(3); // +229… → national
  if (hasLeadingPlus) {
    // +2250707070707 → 2250707070707 (indicatif conservé)
    if (digits.length >= 11) return digits;
    // +97000000 (8 chiffres, + sans indicatif valide) → national
    return digits;
  }
  if (digits.startsWith("00") && digits.length >= 12) return digits.slice(2); // 002250707070707 → 2250707070707
  return digits;
}

/**
 * Format E.164 (+229XXXXXXXX). Accepte une saisie libre (même non normalisée) :
 * le numéro stocké sans indicatif est supposé béninois (défaut historique) ;
 * avec un indicatif (≥ 11 chiffres), il est utilisé tel quel.
 */
export function toE164(p: string): string {
  // Normalise d'abord (retire +229 / 00229 / espaces) pour éviter les doublons
  // de préfixe, puis applique l'indicatif par défaut si absent.
  const digits = phoneDigits(normalizePhone(p));
  if (digits.startsWith("229") && digits.length > 9) return `+${digits}`;
  if (digits.length >= 11) return `+${digits}`;
  return `+${DEFAULT_COUNTRY_CODE}${digits}`;
}

/** Affichage lisible : +229 97 00 00 00 (ou +225 07 07 07 07 07). */
export function displayPhone(p: string | null | undefined): string {
  if (!p) return "";
  const e164 = toE164(p);
  const code = e164.slice(0, 4); // +229 / +225…
  const national = e164.slice(4);
  const spaced = national.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
  return `${code} ${spaced}`;
}

/** Chiffres pour un lien WhatsApp (wa.me/<digits>) — indicatif inclus. */
export function waDigits(p: string): string {
  const e164 = toE164(p);
  return e164.replace(/^\+/, "");
}
