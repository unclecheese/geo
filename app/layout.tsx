import type { Metadata, Viewport } from "next";
import { Fraunces, Spectral } from "next/font/google";
import "./globals.css";
import { DataProvider } from "@/components/DataProvider";
import { FxCanvas } from "@/components/FxCanvas";
import { Toast } from "@/components/Toast";

// Field Atlas type system: a characterful old-style serif for display, a calm
// book serif for body/UI. Self-hosted by next/font (no runtime CDN).
const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});
const body = Spectral({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Atlas — Geography Trainer",
  description: "Learn world geography with map quizzes, spaced repetition, and a continent builder.",
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
      </body>
    </html>
  );
}
