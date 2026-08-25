import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://sigma-events.onrender.com";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/acheter/", "/t/", "/i/", "/mon-billet", "/login", "/register", "/recuperer"],
        disallow: [
          "/admin/",
          "/dashboard/",
          "/events/",
          "/scan/",
          "/transactions/",
          "/notifications/",
          "/profil/",
          "/support/",
          "/alerts/",
          "/pro/",
          "/api/",
          "/_next/",
          "/uploads/",
        ],
      },
      {
        userAgent: "GPTBot",
        disallow: "/",
      },
      {
        userAgent: "ChatGPT-User",
        disallow: "/",
      },
      {
        userAgent: "CCBot",
        disallow: "/",
      },
      {
        userAgent: "Google-Extended",
        disallow: "/",
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
