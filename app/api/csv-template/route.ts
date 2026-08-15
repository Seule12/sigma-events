// Modèle CSV téléchargeable pour l'import des invités (public — aucun secret).
// Colonnes : nom ; téléphone ; catégorie ; email (optionnel) ; personnes (optionnel, le « +1 »).
// La catégorie doit exister dans l'événement ; « personnes » = nombre d'accès autorisés (2 = invité + 1).
export async function GET() {
  const lines = [
    "nom;telephone;categorie;email;personnes",
    "Aya Hounkpatin;97123456;VIP;aya@exemple.com;1",
    "Famille DOSSOU;90000000;VIP;famille.dossou@exemple.com;4",
    "Rachidi Agbessi;96 11 22 33;Standard;;2",
  ];
  // BOM UTF-8 : indispensable pour que Excel affiche les accents.
  const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="sigma-modele-invites.csv"`,
    },
  });
}
