// Formatage monétaire — module léger (aucune dépendance serveur, utilisable côté client).
export function formatFcfa(amount: number): string {
  return `${amount.toLocaleString("fr-FR")} FCFA`;
}
