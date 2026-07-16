import type { Metadata, Viewport } from "next";
import { Archivo_Black, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/components/DataProvider";
import { FxCanvas } from "@/components/FxCanvas";
import { Toast } from "@/components/Toast";

// Arcade-sticker type system: a heavy uppercase display face for headings and
// buttons, a clean geometric grotesk for body/UI. Self-hosted by next/font (no
// runtime CDN).
const display = Archivo_Black({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-display",
  display: "swap",
});
const body = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

// Absolute base for OG/Twitter image URLs. Vercel exposes the production domain
// via VERCEL_PROJECT_PRODUCTION_URL; fall back to localhost in dev.
const baseUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

const TITLE = "GeoBean — Geography Trainer";
const DESCRIPTION =
  "Learn world geography with map quizzes, spaced repetition, and a continent builder.";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  applicationName: "GeoBean",
  title: {
    default: TITLE,
    template: "%s · GeoBean",
  },
  description: DESCRIPTION,
  keywords: [
    "geography quiz",
    "world map game",
    "learn countries",
    "capitals quiz",
    "flags quiz",
    "continent builder",
    "spaced repetition",
  ],
  openGraph: {
    type: "website",
    siteName: "GeoBean",
    title: TITLE,
    description: DESCRIPTION,
    url: "/",
    locale: "en_US",
    // og:image is supplied automatically by app/opengraph-image.tsx
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    // twitter:image is supplied automatically by app/twitter-image.tsx
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <FxCanvas />
        <DataProvider>{children}</DataProvider>
        <Toast />
        {/* Phones in portrait: gate the app behind a rotate prompt. The map and
            puzzle need the width, and browsers can't reliably lock orientation,
            so we ask. Shown purely via CSS (see .rotate-gate) on small portrait
            screens; tablets and desktop never see it. */}
        <div className="rotate-gate" role="alertdialog" aria-label="Rotate your device to landscape">
          <div className="brand">
            <div className="logo" />
            <h1>GeoBean</h1>
          </div>
          <div className="rg-icon" aria-hidden>📱</div>
          <h2>Rotate to landscape</h2>
          <p>GeoBean needs a bit more room — turn your phone sideways to play.</p>
        </div>
      </body>
    </html>
  );
}
