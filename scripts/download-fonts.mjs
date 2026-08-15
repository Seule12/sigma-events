// Télécharge les polices (sous-ensemble latin) depuis Google Fonts pour les
// auto-héberger via next/font/local — contourne l'échec du fetch Turbopack
// sur les machines avec proxy MITM (issue vercel/next.js#78472).
import { writeFileSync } from "node:fs";

const OUT = "app/fonts";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function fetchCss(familyQuery) {
  const res = await fetch(`https://fonts.googleapis.com/css2?${familyQuery}&display=swap`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`CSS ${familyQuery} → HTTP ${res.status}`);
  return res.text();
}

function latinUrls(css) {
  // Découpe en blocs @font-face et garde ceux dont unicode-range commence par U+0000-00FF (latin).
  const blocks = css.split("@font-face").slice(1);
  const out = [];
  for (const block of blocks) {
    if (!/unicode-range:\s*U\+0000-00FF/.test(block)) continue;
    const weight = /font-weight:\s*([0-9]+)(?:\s+[0-9]+)?;/.exec(block)?.[1];
    const src = /src:\s*url\(([^)]+)\)/.exec(block)?.[1];
    if (!src) continue;
    out.push({ weight: weight ?? "variable", url: src });
  }
  return out;
}

async function main() {
  const jobs = [
    { query: "family=Geist:wght@100..900", name: "geist", file: (w) => `geist-${w}.woff2` },
    { query: "family=Barlow+Condensed:wght@500;600;700;800", name: "barlow", file: (w) => `barlow-condensed-${w}.woff2` },
    { query: "family=JetBrains+Mono:wght@400;500;700", name: "jetbrains", file: (w) => `jetbrains-mono-${w}.woff2` },
  ];

  for (const job of jobs) {
    const css = await fetchCss(job.query);
    const urls = latinUrls(css);
    for (const { weight, url } of urls) {
      const target = `${OUT}/${job.file(weight)}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.error(`❌ ${url} → HTTP ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(target, buf);
      console.log(`✅ ${job.file(weight)} (${(buf.length / 1024).toFixed(0)} Ko)`);
    }
  }
}

main();
