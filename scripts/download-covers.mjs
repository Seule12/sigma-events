#!/usr/bin/env node
// scripts/download-covers.mjs
// Télécharge ~100 couvertures d'événements depuis Unsplash (source API).
// Usage : node scripts/download-covers.mjs
// Les images sont enregistrées dans public/event-covers/<category>/
// Un JSON de métadonnées est généré dans public/event-covers/covers.json.

import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

const BASE_DIR = path.join(process.cwd(), "public", "event-covers");
const THUMB_DIR = path.join(process.cwd(), "public", "event-covers", "thumbnails");
const WIDTH = 1600;
const HEIGHT = 900;
const THUMB_W = 640;

// Structure des catégories et requêtes Unsplash
const CATEGORIES = [
  {
    id: "music",
    label: "Concerts & Musique",
    queries: [
      "concert+stage+lights+crowd",
      "concert+crowd+night",
      "singer+microphone+concert",
      "live+band+concert",
      "DJ+concert+crowd",
      "music+festival+crowd",
      "guitar+live+concert",
      "concert+silhouette+audience",
      "outdoor+concert+crowd",
      "concert+lights+background",
    ],
  },
  {
    id: "business",
    label: "Business & Corporate",
    queries: [
      "business+conference+audience",
      "business+keynote+speaker",
      "business+meeting",
      "business+networking+event",
      "business+handshake+event",
      "business+presentation+audience",
      "business+panel+discussion",
      "corporate+team+event",
      "business+convention",
      "modern+conference+hall",
    ],
  },
  {
    id: "education",
    label: "Éducation & Formation",
    queries: [
      "training+workshop+classroom",
      "teacher+workshop+students",
      "seminar+audience",
      "educational+workshop",
      "students+group+discussion",
      "computer+training+workshop",
      "graduation+ceremony",
      "graduation+students",
      "university+conference",
      "university+campus+students",
    ],
  },
  {
    id: "wedding",
    label: "Mariage",
    queries: [
      "wedding+couple+ceremony",
      "wedding+ceremony",
      "wedding+decoration",
      "wedding+reception",
      "wedding+flowers",
      "wedding+table+decoration",
      "wedding+first+dance",
      "wedding+guests+celebration",
      "wedding+rings",
      "African+wedding+ceremony",
    ],
  },
  {
    id: "birthday",
    label: "Anniversaires & Célébrations",
    queries: [
      "birthday+cake+celebration",
      "birthday+balloons+party",
      "birthday+party+friends",
      "birthday+candles+cake",
      "birthday+surprise+party",
      "birthday+party+decoration",
      "children+birthday+party",
      "celebration+party+crowd",
    ],
  },
  {
    id: "festival",
    label: "Festivals & Grands Rassemblements",
    queries: [
      "festival+crowd",
      "festival+night+crowd",
      "outdoor+festival+stage",
      "festival+crowd+hands",
      "cultural+festival+crowd",
      "urban+festival",
      "community+festival",
      "festival+stage+audience",
    ],
  },
  {
    id: "sports",
    label: "Sports",
    queries: [
      "football+match+stadium",
      "athletics+running+competition",
      "basketball+game+crowd",
      "running+race+competition",
      "cycling+race",
      "fitness+event",
      "martial+arts+competition",
      "tennis+tournament",
      "school+sports+competition",
      "sports+awards+podium",
    ],
  },
  {
    id: "conference",
    label: "Conférences & Forums",
    queries: [
      "conference+forum+audience",
      "conference+speaker+stage",
      "panel+discussion+conference",
      "conference+auditorium+audience",
      "conference+podium+microphone",
      "international+conference",
      "youth+conference",
      "technology+conference",
    ],
  },
  {
    id: "technology",
    label: "Technologie & Startups",
    queries: [
      "startup+event",
      "hackathon+developers",
      "technology+conference",
      "innovation+event",
      "developers+coding+event",
      "artificial+intelligence+conference",
    ],
  },
  {
    id: "culture",
    label: "Culture, Art & Spectacle",
    queries: [
      "theater+performance+stage",
      "dance+performance+stage",
      "art+exhibition+gallery",
      "cultural+performance",
      "traditional+cultural+festival",
      "fashion+show+runway",
    ],
  },
  {
    id: "religious",
    label: "Cérémonies Religieuses",
    queries: [
      "church+worship+congregation",
      "religious+gathering",
      "religious+ceremony",
      "church+choir+performance",
      "prayer+gathering",
      "religious+conference",
    ],
  },
  {
    id: "lifestyle",
    label: "Gastronomie & Soirées",
    queries: [
      "formal+dinner+event",
      "cocktail+party+event",
      "food+festival",
      "restaurant+event",
      "elegant+evening+party",
      "rooftop+party+night",
      "beach+party+event",
      "friends+party+celebration",
    ],
  },
];

// Télécharger une image depuis Unsplash Source
async function downloadImage(query, filePath) {
  // Unsplash Source : redirect vers une vraie photo
  const url = `https://source.unsplash.com/${WIDTH}x${HEIGHT}/?${query}`;
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(filePath, buffer);
    return true;
  } catch (e) {
    console.error(`  ✗ Failed: ${query} → ${e.message}`);
    return false;
  }
}

// Créer une miniature (simple redimensionnement via sharp si disponible, sinon copie)
async function createThumbnail(src, dest) {
  try {
    // Tenter avec sharp si installé
    const sharp = (await import("sharp")).default;
    await sharp(src).resize(THUMB_W).toFile(dest);
  } catch {
    // sharp non installé : copier l'image originale
    await fs.copyFile(src, dest);
  }
}

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║  SIGMA Events — Cover Downloader     ║");
  console.log("╚══════════════════════════════════════╝\n");

  // Créer les répertoires
  await fs.mkdir(BASE_DIR, { recursive: true });
  await fs.mkdir(THUMB_DIR, { recursive: true });

  const metadata = [];
  let total = 0;
  let downloaded = 0;

  for (const cat of CATEGORIES) {
    const catDir = path.join(BASE_DIR, cat.id);
    const thumbCatDir = path.join(THUMB_DIR, cat.id);
    await fs.mkdir(catDir, { recursive: true });
    await fs.mkdir(thumbCatDir, { recursive: true });

    console.log(`\n📁 ${cat.label} (${cat.id})`);

    for (let i = 0; i < cat.queries.length; i++) {
      const query = cat.queries[i];
      const id = `${cat.id}-${String(i + 1).padStart(3, "0")}`;
      const fileName = `${id}.jpg`;
      const thumbFileName = `${id}.jpg`;
      const filePath = path.join(catDir, fileName);
      const thumbPath = path.join(thumbCatDir, thumbFileName);

      total++;

      // Vérifier si déjà téléchargé
      try {
        await fs.access(filePath);
        console.log(`  ✓ ${fileName} (existe déjà)`);
        downloaded++;
        metadata.push({
          id,
          title: query.replace(/\+/g, " ").replace(/\w+/g, (w) => w[0].toUpperCase() + w.slice(1)),
          category: cat.id,
          categoryLabel: cat.label,
          image_url: `/event-covers/${cat.id}/${fileName}`,
          thumbnail_url: `/event-covers/thumbnails/${cat.id}/${thumbFileName}`,
          source: "Unsplash",
          width: WIDTH,
          height: HEIGHT,
          aspect_ratio: "16:9",
          orientation: "landscape",
          tags: query.split("+"),
          is_active: true,
        });
        continue;
      } catch {
        // Fichier n'existe pas, on le télécharge
      }

      process.stdout.write(`  ↓ ${fileName}... `);
      const ok = await downloadImage(query, filePath);
      if (ok) {
        downloaded++;
        console.log("✓");
        await createThumbnail(filePath, thumbPath);
        metadata.push({
          id,
          title: query.replace(/\+/g, " ").replace(/\w+/g, (w) => w[0].toUpperCase() + w.slice(1)),
          category: cat.id,
          categoryLabel: cat.label,
          image_url: `/event-covers/${cat.id}/${fileName}`,
          thumbnail_url: `/event-covers/thumbnails/${cat.id}/${thumbFileName}`,
          source: "Unsplash",
          width: WIDTH,
          height: HEIGHT,
          aspect_ratio: "16:9",
          orientation: "landscape",
          tags: query.split("+"),
          is_active: true,
        });
      }
    }
  }

  // Écrire le JSON de métadonnées
  const jsonPath = path.join(BASE_DIR, "covers.json");
  await fs.writeFile(jsonPath, JSON.stringify(metadata, null, 2));

  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  Terminé !                           ║`);
  console.log(`║  ${downloaded}/${total} images téléchargées          ║`);
  console.log(`║  Métadonnées : ${jsonPath}            ║`);
  console.log(`╚══════════════════════════════════════╝`);
}

main().catch(console.error);
