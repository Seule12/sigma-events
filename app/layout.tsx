import type { Metadata, Viewport } from "next";
// Polices auto-hébergées (next/font/local) : le téléchargement Google Fonts par
// Turbopack échoue sur les machines avec proxy MITM (vercel/next.js#78472) —
// les fichiers woff2 latin sont dans app/fonts (scripts/download-fonts.mjs).
import localFont from "next/font/local";
import "./globals.css";
import ThemeProvider from "@/components/theme-provider";
import ServiceWorkerRegister from "@/components/sw-register";
import LiveNotifications from "@/components/live-notifications";

const geistSans = localFont({
  src: "./fonts/geist-var.woff2",
  variable: "--font-geist-sans",
  display: "swap",
});
// Titres condensés type SIGMA EVENTS (le langage visuel du prototype).
const barlowCondensed = localFont({
  src: [
    { path: "./fonts/barlow-condensed-500.woff2", weight: "500" },
    { path: "./fonts/barlow-condensed-600.woff2", weight: "600" },
    { path: "./fonts/barlow-condensed-700.woff2", weight: "700" },
    { path: "./fonts/barlow-condensed-800.woff2", weight: "800" },
  ],
  variable: "--font-barlow",
  display: "swap",
});
// Codes, références, labels techniques et chiffres (JetBrains Mono).
const jetbrainsMono = localFont({
  src: [
    { path: "./fonts/jetbrains-mono-400.woff2", weight: "400" },
    { path: "./fonts/jetbrains-mono-500.woff2", weight: "500" },
    { path: "./fonts/jetbrains-mono-700.woff2", weight: "700" },
  ],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sigma Events — Billetterie, invitations et contrôle d'accès",
  description:
    "Plateforme de sécurité des biens et des personnes : billets QR, contrôle d'accès temps réel, jauge de capacité.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon-512.png",
    apple: "/icon-512.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#047857",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${barlowCondensed.variable} ${jetbrainsMono.variable} antialiased`}>
        <ThemeProvider>{children}</ThemeProvider>
        {/* Notifications temps réel Ably (toast global + badge sidebar) */}
        <LiveNotifications />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
