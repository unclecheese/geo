import type { Metadata, Viewport } from "next";
import "./globals.css";
import { DataProvider } from "@/components/DataProvider";
import { FxCanvas } from "@/components/FxCanvas";
import { Toast } from "@/components/Toast";

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
    <html lang="en">
      <body>
        <FxCanvas />
        <DataProvider>{children}</DataProvider>
        <Toast />
      </body>
    </html>
  );
}
