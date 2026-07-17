import type { MetadataRoute } from "next";

// PWA manifest — installable icons + brand colours. Next auto-links this at
// /manifest.webmanifest. Orientation is deliberately unset: phones get the
// rotate-to-landscape gate, but tablets stay usable in either orientation.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "GeoBean — Geography Trainer",
    short_name: "GeoBean",
    description:
      "Learn world geography with map quizzes, spaced repetition, and a continent builder.",
    start_url: "/",
    display: "standalone",
    background_color: "#2c3554",
    theme_color: "#2c3554",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
