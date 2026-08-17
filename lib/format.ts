// Formatage — module léger (aucune dépendance serveur, utilisable côté client).
import { displayPhone as _displayPhone } from "@/lib/phone";

export function formatFcfa(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} FCFA`;
}

// Affichage lisible d'un numéro de téléphone (+229 97 00 00 00, +225 07 07 07 07 07…).
export function displayPhone(p: string | null | undefined): string {
  return _displayPhone(p);
}
