// Couvertures suggérées par type d'événement — bibliothèque de 160 images.
//
// Le fichier covers-library.json contient ~160 couvertures organisées par
// catégorie (Unsplash 1600×900 + thumbnails 640×360). Ce module les charge
// et les associe au type saisi par l'organisateur via des mots-clés.
//
// En complément, 3 variations SVG gradient sont toujours disponibles pour
// chaque catégorie (fonctionnent sans réseau).

import coversLibrary from "@/lib/covers-library.json";

export type CoverSuggestion = {
  label: string;
  url: string;
};

// ============ CATÉGORIES + MOTS-CLÉS ============
// Mapping mots-clés → catégorie de la bibliothèque.
// Le type saisi par l'organisateur est normalisé puis comparé aux mots-clés.
const CATEGORIES: Array<{
  id: string; // id dans covers-library.json
  label: string;
  keywords: string[];
  base: string;
  accent: string;
  icon: string;
  variations: string[];
}> = [
  {
    id: "music",
    label: "Concert / Show",
    keywords: ["concert", "show", "live", "musique", "music", "festival", "afro", "zouk", "coupé", "décalé", "dj", "rave", "gala musical"],
    base: "#7c3aed",
    accent: "#ec4899",
    icon: '<path d="M32 8c8 0 14 10 14 22s-6 22-14 22S18 42 18 30 24 8 32 8z" fill="rgba(255,255,255,.18)"/><path d="M32 8c8 0 14 10 14 22s-6 22-14 22S18 42 18 30 24 8 32 8z" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2"/><path d="M26 30h12M32 24v12" stroke="rgba(255,255,255,.9)" stroke-width="3" stroke-linecap="round"/>',
    variations: ["#7c3aed,#ec4899,#f59e0b", "#db2777,#f43f5e,#fb923c", "#4f46e5,#8b5cf6,#d946ef"],
  },
  {
    id: "business",
    label: "Business / Corporate",
    keywords: ["business", "corporate", "entreprise", "professionnel", "pro", "société", "societe", "management", "entreprise"],
    base: "#1d4ed8",
    accent: "#06b6d4",
    icon: '<rect x="12" y="22" width="40" height="6" rx="2" fill="rgba(255,255,255,.75)"/><rect x="20" y="28" width="24" height="24" rx="2" fill="rgba(255,255,255,.2)"/><path d="M32 14v8M24 10h16" stroke="rgba(255,255,255,.9)" stroke-width="3" stroke-linecap="round"/>',
    variations: ["#1e40af,#3b82f6,#22d3ee", "#0f766e,#2dd4bf,#a3e635", "#4338ca,#6366f1,#38bdf8"],
  },
  {
    id: "education",
    label: "Éducation / Formation",
    keywords: ["formation", "éducation", "education", "séminaire", "seminaire", "atelier", "workshop", "cours", "classe", "université", "universite", "campus", "diplôme", "diplome"],
    base: "#0891b2",
    accent: "#06b6d4",
    icon: '<path d="M32 12l20 10-20 10-20-10z" fill="rgba(255,255,255,.25)"/><path d="M32 12l20 10v12l-20 10-20-10V22z" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2.5"/><path d="M16 24v16l16 8 16-8V24" stroke="rgba(255,255,255,.5)" stroke-width="2"/>',
    variations: ["#0891b2,#06b6d4,#67e8f9", "#0e7490,#22d3ee,#a5f3fc", "#164e63,#0891b2,#22d3ee"],
  },
  {
    id: "wedding",
    label: "Mariage",
    keywords: ["mariage", "wedding", "mariage civil", "bénédiction", "benediction", "traditionnel", "dot", "fiançailles", "fiancailles"],
    base: "#e11d48",
    accent: "#fbbf24",
    icon: '<circle cx="26" cy="30" r="10" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="3"/><circle cx="38" cy="30" r="10" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="3"/><path d="M32 32l-4 4m4-4l4 4M32 36v12" stroke="rgba(255,255,255,.85)" stroke-width="2.5" stroke-linecap="round"/><path d="M32 48l-5 5m5-5l5 5" stroke="rgba(255,255,255,.6)" stroke-width="2" stroke-linecap="round"/>',
    variations: ["#be123c,#f43f5e,#fbbf24", "#0d9488,#14b8a6,#facc15", "#c2410c,#ea580c,#fcd34d"],
  },
  {
    id: "birthday",
    label: "Anniversaire",
    keywords: ["anniversaire", "birthday", "fête", "fete", "party", "célébration", "celebration"],
    base: "#9333ea",
    accent: "#f472b6",
    icon: '<path d="M18 26h28M20 34h24M24 42h16" stroke="rgba(255,255,255,.85)" stroke-width="3" stroke-linecap="round"/><circle cx="40" cy="16" r="4" fill="rgba(255,255,255,.95)"/><circle cx="18" cy="16" r="2.6" fill="rgba(255,255,255,.7)"/><circle cx="50" cy="22" r="2.2" fill="rgba(255,255,255,.5)"/>',
    variations: ["#7e22ce,#c026d3,#f472b6", "#b91c1c,#f97316,#facc15", "#0e7490,#06b6d4,#f0abfc"],
  },
  {
    id: "festival",
    label: "Festival",
    keywords: ["festival", "rassemblement", "rassemblement", "foire", "carnaval", "kermesse", "journée portes ouvertes"],
    base: "#c026d3",
    accent: "#f59e0b",
    icon: '<path d="M18 44V28l14-16 14 16v16" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="3"/><path d="M10 44h44" stroke="rgba(255,255,255,.5)" stroke-width="2"/><circle cx="32" cy="28" r="6" fill="rgba(255,255,255,.6)"/>',
    variations: ["#c026d3,#e879f9,#facc15", "#9333ea,#a855f7,#fb923c", "#7c3aed,#c084fc,#22d3ee"],
  },
  {
    id: "sports",
    label: "Sport / Tournoi",
    keywords: ["sport", "tournoi", "match", "football", "basket", "marathon", "course", "compétition", "competition", "gala sportif", "cyclisme", "tennis", "fitness", "athlétisme"],
    base: "#059669",
    accent: "#a3e635",
    icon: '<circle cx="32" cy="32" r="18" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="3"/><path d="M32 14v36M14 32h36" stroke="rgba(255,255,255,.4)" stroke-width="1.5"/><path d="M24 24l16 16M40 24L24 40" stroke="rgba(255,255,255,.6)" stroke-width="2"/>',
    variations: ["#047857,#10b981,#bef264", "#1d4ed8,#2563eb,#4ade80", "#b45309,#f59e0b,#fde047"],
  },
  {
    id: "conference",
    label: "Conférence / Forum",
    keywords: ["conférence", "conference", "salon", "forum", "séminaire", "seminaire", "sommet", "expo", "exposition", "colloque", "panel", "keynote"],
    base: "#1d4ed8",
    accent: "#06b6d4",
    icon: '<rect x="12" y="22" width="40" height="6" rx="2" fill="rgba(255,255,255,.75)"/><rect x="20" y="28" width="24" height="24" rx="2" fill="rgba(255,255,255,.2)"/><path d="M32 14v8M24 10h16" stroke="rgba(255,255,255,.9)" stroke-width="3" stroke-linecap="round"/>',
    variations: ["#1e40af,#3b82f6,#22d3ee", "#0f766e,#2dd4bf,#a3e635", "#4338ca,#6366f1,#38bdf8"],
  },
  {
    id: "technology",
    label: "Technologie / Innovation",
    keywords: ["technologie", "technology", "innovation", "startup", "hackathon", "coding", "digital", "intelligence artificielle", "ia", "tech"],
    base: "#0f172a",
    accent: "#22d3ee",
    icon: '<rect x="16" y="16" width="32" height="24" rx="3" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2.5"/><path d="M24 40h16" stroke="rgba(255,255,255,.5)" stroke-width="2.5"/><path d="M32 44v3" stroke="rgba(255,255,255,.5)" stroke-width="2.5"/><path d="M22 24h4v6h-4zM28 22h4v8h-4zM34 26h4v4h-4z" fill="rgba(255,255,255,.6)"/>',
    variations: ["#0f172a,#1e293b,#22d3ee", "#0c4a6e,#0369a1,#67e8f9", "#134e4a,#0f766e,#5eead4"],
  },
  {
    id: "culture",
    label: "Culture / Art / Spectacle",
    keywords: ["culture", "art", "spectacle", "théâtre", "theatre", "danse", "exposition", "musée", "musee", "galerie", "défilé", "defile", "mode"],
    base: "#7c3aed",
    accent: "#f59e0b",
    icon: '<path d="M16 18c0-8.8 7.2-16 16-16s16 7.2 16 16" fill="none" stroke="rgba(255,255,255,.6)" stroke-width="2.5"/><path d="M12 48l20-20 20 20" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="3" stroke-linecap="round"/><circle cx="32" cy="18" r="8" fill="rgba(255,255,255,.35)"/>',
    variations: ["#7c3aed,#a855f7,#f59e0b", "#6d28d9,#c084fc,#fbbf24", "#4c1d95,#7c3aed,#eab308"],
  },
  {
    id: "religious",
    label: "Culte / Religieux",
    keywords: ["culte", "église", "eglise", "prière", "priere", "évangélisation", "evangelisation", "croisade", "veillée", "veillee", "mosquée", "mosquee", "religieux", "religieuse", "spirituel"],
    base: "#b45309",
    accent: "#fcd34d",
    icon: '<path d="M32 10l10 20H22l10-20z" fill="rgba(255,255,255,.8)"/><path d="M26 30h12v16H26z" fill="rgba(255,255,255,.25)"/><path d="M22 46h20" stroke="rgba(255,255,255,.8)" stroke-width="3" stroke-linecap="round"/>',
    variations: ["#92400e,#d97706,#fde68a", "#334155,#64748b,#e2e8f0", "#065f46,#059669,#fef3c7"],
  },
  {
    id: "lifestyle",
    label: "Gastronomie / Soirée",
    keywords: ["gala", "dîner", "diner", "banquet", "cocktail", "lifestyle", "rooftop", "soirée", "soiree", "afterwork", "pool party", "beach", "gastronomie", "restaurant"],
    base: "#0f172a",
    accent: "#eab308",
    icon: '<path d="M20 14h24v8c0 10-5 16-12 16S20 32 20 22v-8z" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="3"/><path d="M20 18H14m36 0h-6M24 10l-4-4m20 4l4-4" stroke="rgba(255,255,255,.85)" stroke-width="2.5" stroke-linecap="round"/>',
    variations: ["#0f172a,#334155,#facc15", "#1e1b4b,#4c1d95,#fbbf24", "#3f1d0e,#92400e,#fde68a"],
  },
  {
    id: "nightlife",
    label: "Nuit / Clubbing",
    keywords: ["nuit", "night", "club", "clubbing", "boite de nuit", "soirée", "soiree", "fête", "fete", "nuit", "after", "lounge", "party", "mix"],
    base: "#581c87",
    accent: "#e879f9",
    icon: '<path d="M16 44V20c0-8.8 7.2-16 16-16s16 7.2 16 16v24" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2.5"/><path d="M20 44h24" stroke="rgba(255,255,255,.6)" stroke-width="2"/><circle cx="32" cy="20" r="6" fill="rgba(255,255,255,.5)"/><path d="M26 36h12" stroke="rgba(255,255,255,.85)" stroke-width="3" stroke-linecap="round"/>',
    variations: ["#581c87,#a855f7,#ec4899", "#1e1b4b,#7c3aed,#f472b6", "#3b0764,#9333ea,#fb923c"],
  },
  {
    id: "food",
    label: "Gastronomie / Food Festival",
    keywords: ["gastronomie", "food", "cuisine", "restaurant", "festival culinaire", "brunch", "dîner", "diner", "banquet", "street food", "marché", "gourmand"],
    base: "#c2410c",
    accent: "#fbbf24",
    icon: '<ellipse cx="32" cy="36" rx="20" ry="8" fill="none" stroke="rgba(255,255,255,.7)" stroke-width="2.5"/><path d="M32 28v-10M26 18h12" stroke="rgba(255,255,255,.85)" stroke-width="3" stroke-linecap="round"/><path d="M18 36c0-6 6.3-10 14-10s14 4 14 10" fill="none" stroke="rgba(255,255,255,.5)" stroke-width="2"/>',
    variations: ["#c2410c,#ea580c,#fbbf24", "#7c2d12,#b45309,#fde68a", "#9a3412,#f97316,#fcd34d"],
  },
  {
    id: "charity",
    label: "Caritatif / Solidaire",
    keywords: ["caritatif", "solidarité", "solidarite", "charity", "don", "donation", "humanitaire", "bienfaisance", "galà", "gala", "solidaire", "entraide"],
    base: "#059669",
    accent: "#34d399",
    icon: '<path d="M32 46c-12-8-24-16-24-24a12 12 0 0 1 24 0 12 12 0 0 1 24 0c0 8-12 16-24 24z" fill="rgba(255,255,255,.35)" stroke="rgba(255,255,255,.75)" stroke-width="2.5"/><path d="M22 30l6 6 12-14" stroke="rgba(255,255,255,.9)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    variations: ["#059669,#10b981,#6ee7b7", "#047857,#34d399,#a7f3d0", "#065f46,#059669,#d1fae5"],
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

// ============ BIBLIOTHÈQUE D'IMAGES ============
// Import des ~100 couvertures depuis covers-library.json.
// Mapping id de catégorie → tableau d'images Unsplash.
type LibraryImage = { id: string; title: string; url: string; thumbUrl: string; source: string; composition: string; tags: string[] };

const COVERS_BY_CATEGORY: Record<string, LibraryImage[]> = {};
for (const cat of coversLibrary.categories) {
  COVERS_BY_CATEGORY[cat.id] = cat.images as LibraryImage[];
}

// ============ MAPPING TYPE SAISI → CATÉGORIE ============

function normalizeType(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Retrouve la catégorie la plus proche du type saisi (générique en dernier recours).
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

// ============ SVG GRADIENT (toujours disponible) ============

function buildSvg(c1: string, c2: string, c3: string, icon: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
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
  <rect width="1600" height="900" fill="url(#g)"/>
  <rect width="1600" height="900" fill="url(#h)"/>
  <circle cx="1400" cy="120" r="320" fill="rgba(255,255,255,.07)"/>
  <circle cx="120" cy="780" r="400" fill="rgba(255,255,255,.06)"/>
  <circle cx="800" cy="450" r="200" fill="rgba(0,0,0,.10)"/>
  <g transform="translate(768 398) scale(1.2)">${icon}</g>
  <rect x="0" y="0" width="1600" height="16" fill="rgba(255,255,255,.14)"/>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ============ FONCTIONS PUBLIQUES ============

// Retourne toutes les couvertures suggérées : SVG gradient + Unsplash (160 images).
export function coverSuggestions(type: string): CoverSuggestion[] {
  const cat = matchCategory(type);

  // 1. Variations SVG gradient (toujours disponibles, pas de réseau)
  const svgSuggestions: CoverSuggestion[] = cat.variations.map((palette, i) => {
    const [c1, c2, c3] = palette.split(",");
    return {
      label: `${cat.label}${cat.id === "general" ? "" : ` — variation ${i + 1}`}`,
      url: buildSvg(c1, c2, c3, cat.icon),
    };
  });

  // 2. Images Unsplash de la bibliothèque (~160 images, 15 catégories)
  const libraryImages = COVERS_BY_CATEGORY[cat.id] ?? [];
  const unsplashSuggestions: CoverSuggestion[] = libraryImages.map((img) => ({
    label: img.title,
    url: img.url,
  }));

  return [...svgSuggestions, ...unsplashSuggestions];
}

// Récupère uniquement les images Unsplash (pour le picker enrichi).
export function unsplashSuggestions(type: string): CoverSuggestion[] {
  const cat = matchCategory(type);
  return (COVERS_BY_CATEGORY[cat.id] ?? []).map((img) => ({
    label: img.title,
    url: img.url,
  }));
}

// Récupère toutes les catégories disponibles (pour un picker global).
export function allCategories(): Array<{ id: string; label: string; count: number }> {
  return CATEGORIES.map((cat) => ({
    id: cat.id,
    label: cat.label,
    count: (COVERS_BY_CATEGORY[cat.id] ?? []).length,
  })).filter((c) => c.count > 0 || c.id === "general");
}

// Récupère les images d'une catégorie spécifique.
export function categoryImages(categoryId: string): CoverSuggestion[] {
  return (COVERS_BY_CATEGORY[categoryId] ?? []).map((img) => ({
    label: img.title,
    url: img.url,
  }));
}
