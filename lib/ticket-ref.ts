// Référence affichée sous le QR (et utilisée pour nommer les fichiers exportés) :
// les codes de démo restent lisibles (DEMO-…), les vrais codes (UUID) sont
// raccourcis en SIG-XXXXXX.
export function ticketRef(code: string): string {
  if (code.startsWith("DEMO-")) return code;
  return `SIG-${code.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 6)}`;
}

// Nom de fichier PNG d'un billet — maquette : Billet_SIGMA_SIG-839281_Aya_Hounkpatin.png
// (accents et caractères spéciaux retirés pour un nom de fichier sûr).
export function ticketPngFilename(code: string, guestName: string): string {
  const ref = ticketRef(code);
  const safeName =
    guestName
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "Billet";
  return `Billet_SIGMA_${ref}_${safeName}.png`;
}
