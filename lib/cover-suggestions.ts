// Couvertures suggérées par type d'événement — SVG générés en data URL.
//
// Aucune dépendance externe ni hébergement : chaque couverture est un SVG
// autonome (dégradé + motifs + icône) encodé en data URL. L'organisateur peut
// soit reprendre une suggestion, soit coller/importer sa propre image.
//
// L'icône est une forme SVG géométrique (sans police externe) : étoile pour le
// concert, anneaux pour le mariage, estrade pour la conférence… Le motif de
// fond varie selon la « variation » choisie.

export type CoverSuggestion = {
  label: string; // ex. « Concert — variation 1 »
  url: string; // data URL SVG prête à stocker dans imageUrl
};

// Catégories d'événements reconnues par mots-clés (insensibles à la casse et
// aux accents). Le type saisi par l'organisateur est normalisé puis comparé.
const CATEGORIES: Array<{
  id: string;
  label: string;
  keywords: string[];
  base: string; // couleur dominante 1
  accent: string; // couleur dominante 2
  icon: string; // chemin/forme SVG dans un viewBox 0 0 64 64
  variations: string[]; // palettes (c1, c2, c3) par variation
}> = [
  {
    id: "concert",
    label: "Concert / Show",
    keywords: ["concert", "show", "live", "musique", "music", "festival", "afro", "zouk", "coupé", "décalé"],
    base: "#7c3aed",
    accent: "#ec4899",
    icon: '<path d="M32 8c8 0 14 10 14 22s-6 22-14 22S18 42 18 30 24 8 32 8z" fill="rgba(255,255,255,.18)"/><path d="M32 8c8 0 14 10 14 22s-6 22-14 22S18 42 18 30 24 8 32 8z" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2"/><path d="M26 30h12M32 24v12" stroke="rgba(255,255,255,.9)" stroke-width="3" stroke-linecap="round"/>',
    variations: ["#7c3aed,#ec4899,#f59e0b", "#db2777,#f43f5e,#fb923c", "#4f46e5,#8b5cf6,#d946ef"],
  },
  {
    id: "mariage",
    label: "Mariage / Cérémonie",
    keywords: ["mariage", "wedding", "mariage civil", "bénédiction", "traditionnel", "dot", "fiançailles"],
    base: "#e11d48",
    accent: "#fbbf24",
    icon: '<circle cx="26" cy="30" r="10" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="3"/><circle cx="38" cy="30" r="10" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="3"/><path d="M32 32l-4 4m4-4l4 4M32 36v12" stroke="rgba(255,255,255,.85)" stroke-width="2.5" stroke-linecap="round"/><path d="M32 48l-5 5m5-5l5 5" stroke="rgba(255,255,255,.6)" stroke-width="2" stroke-linecap="round"/>',
    variations: ["#be123c,#f43f5e,#fbbf24", "#0d9488,#14b8a6,#facc15", "#c2410c,#ea580c,#fcd34d"],
  },
  {
    id: "conference",
    label: "Conférence / Salon",
    keywords: ["conférence", "conference", "salon", "forum", "séminaire", "seminaire", "sommet", "expo", "exposition", "colloque", "atelier"],
    base: "#1d4ed8",
    accent: "#06b6d4",
    icon: '<rect x="12" y="22" width="40" height="6" rx="2" fill="rgba(255,255,255,.75)"/><rect x="20" y="28" width="24" height="24" rx="2" fill="rgba(255,255,255,.2)"/><path d="M32 14v8M24 10h16" stroke="rgba(255,255,255,.9)" stroke-width="3" stroke-linecap="round"/>',
    variations: ["#1e40af,#3b82f6,#22d3ee", "#0f766e,#2dd4bf,#a3e635", "#4338ca,#6366f1,#38bdf8"],
  },
  {
    id: "soiree",
    label: "Soirée / Fête privée",
    keywords: ["soirée", "soiree", "fête", "fete", "party", "anniversaire", "afterwork", "after work", "pool party", "bal"],
    base: "#9333ea",
    accent: "#f472b6",
    icon: '<path d="M18 26h28M20 34h24M24 42h16" stroke="rgba(255,255,255,.85)" stroke-width="3" stroke-linecap="round"/><circle cx="40" cy="16" r="4" fill="rgba(255,255,255,.95)"/><circle cx="18" cy="16" r="2.6" fill="rgba(255,255,255,.7)"/><circle cx="50" cy="22" r="2.2" fill="rgba(255,255,255,.5)"/>',
    variations: ["#7e22ce,#c026d3,#f472b6", "#b91c1c,#f97316,#facc15", "#0e7490,#06b6d4,#f0abfc"],
  },
  {
    id: "sport",
    label: "Sport / Tournoi",
    keywords: ["sport", "tournoi", "match", "football", "basket", "marathon", "course", "compétition", "competition", "gala sportif"],
    base: "#059669",
    accent: "#a3e635",
    icon: '<circle cx="32" cy="32" r="18" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="3"/><path d="M32 14v36M14 32h36" stroke="rgba(255,255,255,.4)" stroke-width="1.5"/><path d="M24 24l16 16M40 24L24 40" stroke="rgba(255,255,255,.6)" stroke-width="2"/>',
    variations: ["#047857,#10b981,#bef264", "#1d4ed8,#2563eb,#4ade80", "#b45309,#f59e0b,#fde047"],
  },
  {
    id: "religieux",
    label: "Culte / Événement religieux",
    keywords: ["culte", "église", "eglise", "prière", "priere", "évangélisation", "evangelisation", "croisade", "veillée", "veillee", "mosquée", "mosquee"],
    base: "#b45309",
    accent: "#fcd34d",
    icon: '<path d="M32 10l10 20H22l10-20z" fill="rgba(255,255,255,.8)"/><path d="M26 30h12v16H26z" fill="rgba(255,255,255,.25)"/><path d="M22 46h20" stroke="rgba(255,255,255,.8)" stroke-width="3" stroke-linecap="round"/>',
    variations: ["#92400e,#d97706,#fde68a", "#334155,#64748b,#e2e8f0", "#065f46,#059669,#fef3c7"],
  },
  {
    id: "gala",
    label: "Gala / Remise de prix",
    keywords: ["gala", "remise de prix", "récompense", "recompense", "awards", "distinction", "dîner", "diner", "banquet"],
    base: "#0f172a",
    accent: "#eab308",
    icon: '<path d="M20 14h24v8c0 10-5 16-12 16S20 32 20 22v-8z" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="3"/><path d="M20 18H14m36 0h-6M24 10l-4-4m20 4l4-4" stroke="rgba(255,255,255,.85)" stroke-width="2.5" stroke-linecap="round"/>',
    variations: ["#0f172a,#334155,#facc15", "#1e1b4b,#4c1d95,#fbbf24", "#3f1d0e,#92400e,#fde68a"],
  },
  {
    id: "general",
    label: "Générique",
    keywords: [],
    base: "#334155",
    accent: "#818cf8",
    icon: '<circle cx="32" cy="32" r="18" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2.5"/><circle cx="32" cy="32" r="10" fill="rgba(255,255,255,.22)"/><circle cx="32" cy="32" r="4" fill="rgba(255,255,255,.6)"/>',
    variations: ["#1e293b,#475569,#94a3b8", "#0c4a6e,#0369a1,#7dd3fc", "#134e4a,#0f766e,#5eead4"],
  },
];

// Normalise le type saisi : minuscules, sans accents, espaces uniques.
function normalizeType(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Retrouve la catégorie la plus proche du type saisi (générique en dernier recours).
// Mots-clés sur des limites de mots (\b) pour éviter les faux positifs :
// « football » ne doit pas matcher « bal » de la catégorie soirée.
export function matchCategory(type: string): { id: string; label: string; variations: string[]; icon: string } {
  const n = normalizeType(type);
  for (const cat of CATEGORIES) {
    if (cat.keywords.some((k) => new RegExp(`\\b${k}\\b`).test(n))) {
      return { id: cat.id, label: cat.label, variations: cat.variations, icon: cat.icon };
    }
  }
  const cat = CATEGORIES[CATEGORIES.length - 1];
  return { id: cat.id, label: cat.label, variations: cat.variations, icon: cat.icon };
}

// Construit le SVG de couverture (1200×630, dégradé + cercles + icône).
function buildSvg(c1: string, c2: string, c3: string, icon: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${c1}"/>
      <stop offset=".55" stop-color="${c2}"/>
      <stop offset="1" stop-color="${c3}"/>
    </linearGradient>
    <radialGradient id="h" cx=".2" cy=".1" r="1">
      <stop offset="0" stop-color="rgba(255,255,255,.25)"/>
      <stop offset="1" stop-color="rgba(255,255,255,0)"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <rect width="1200" height="630" fill="url(#h)"/>
  <circle cx="1050" cy="90" r="240" fill="rgba(255,255,255,.07)"/>
  <circle cx="90" cy="560" r="300" fill="rgba(255,255,255,.06)"/>
  <circle cx="600" cy="315" r="150" fill="rgba(0,0,0,.10)"/>
  <g transform="translate(568 253) scale(1)">${icon}</g>
  <rect x="0" y="0" width="1200" height="12" fill="rgba(255,255,255,.14)"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Retourne les couvertures suggérées pour un type d'événement (3 variations).
export function coverSuggestions(type: string): CoverSuggestion[] {
  const cat = matchCategory(type);
  return cat.variations.map((palette, i) => {
    const [c1, c2, c3] = palette.split(",");
    return {
      label: `${cat.label}${cat.id === "general" ? "" : ` — variation ${i + 1}`}`,
      url: buildSvg(c1, c2, c3, cat.icon),
    };
  });
}
