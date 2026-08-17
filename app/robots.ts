import type { MetadataRoute } from "next";

// robots.txt — accès temporairement ouvert pour permettre l'audit (crawl
// autorisé pour tous les robots, y compris les agents d'audit IA).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
  };
}
