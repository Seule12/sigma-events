// Parsing CSV partagé entre l'action d'import et les tests.

export type CsvGuestRow = {
  name: string;
  phone: string; // téléphone normalisé (vide si absent)
  categoryName: string;
  email: string; // email (vide si absent) — colonne optionnelle 4
  people: number; // nombre de personnes autorisées (le « +1 », 1 par défaut) — colonne optionnelle 5
};

export function parseCsv(text: string): string[][] {
  // Détecte le délimiteur (Excel FR exporte souvent avec des ;)
  const firstLine = text.split(/\r?\n/).find((l) => l.trim().length > 0) || "";
  const delim = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field.trim());
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      field = "";
      if (row.some((f) => f.length > 0)) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  row.push(field.trim());
  if (row.some((f) => f.length > 0)) rows.push(row);
  return rows;
}

// Normalise un numéro béninois : retire +229 / 00229 / espaces / tirets.
export function normalizePhone(p: string): string {
  const digits = p.replace(/\D/g, "");
  if (digits.startsWith("00229")) return digits.slice(5);
  if (digits.startsWith("229") && digits.length > 9) return digits.slice(3);
  return digits;
}

export const CSV_MAX_ROWS = 5000;

/**
 * Convertit le contenu d'un fichier CSV en invités.
 * - Ignore la ligne d'en-tête si elle commence par « nom/name/prénom »
 * - Colonnes attendues : nom ; téléphone ; catégorie ; email (opt) ; personnes (opt)
 */
export function parseGuestCsv(text: string): {
  rows: CsvGuestRow[];
  error: "EMPTY" | "TOO_LARGE" | null;
} {
  const cleaned = text.replace(/^\uFEFF/, "");
  const parsed = parseCsv(cleaned);

  if (parsed.length > 0 && /nom|name|prénom|prenom/i.test(parsed[0][0] || "")) parsed.shift();
  if (parsed.length === 0) return { rows: [], error: "EMPTY" };
  if (parsed.length > CSV_MAX_ROWS) return { rows: [], error: "TOO_LARGE" };

  const rows: CsvGuestRow[] = [];
  for (const fields of parsed) {
    const [name, phone, categoryName, email, people] = fields;
    if (!name) continue;
    const peopleNum = parseInt(String(people || ""), 10);
    rows.push({
      name: name.trim(),
      phone: phone ? normalizePhone(phone) : "",
      categoryName: (categoryName || "").trim(),
      email: (email || "").trim(),
      people: Number.isFinite(peopleNum) && peopleNum > 0 ? Math.min(10, peopleNum) : 1,
    });
  }
  return { rows, error: null };
}
