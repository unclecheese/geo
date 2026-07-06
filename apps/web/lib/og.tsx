import { ImageResponse } from "next/og";

// Shared render for the Open Graph / Twitter share card (1200×630).
// Used by both app/opengraph-image.tsx and app/twitter-image.tsx.
export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";
export const OG_ALT =
  "GeoBean — learn world geography with map quizzes, flags, capitals and a continent builder";

// The GeoBean mascot, inlined so the card is fully self-contained (no fetch).
const BEAN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#6ee7ff"/><stop offset="55%" stop-color="#34d399"/><stop offset="100%" stop-color="#22a06b"/></linearGradient></defs><path d="M11 32 C11 19 21 12 31 16 C37 18.4 40 24 46 22 C54 19 60 27 58 37 C56 49 44 57 30 55 C17 53 11 44 11 32 Z" fill="url(#b)" stroke="#0f3d2e" stroke-width="2" stroke-linejoin="round"/><path d="M40 24 c5 -1.5 8 2.5 6 6.5 c-2.4 4 -8.5 2 -8.5 -2.5 c0 -2.6 0 -3.2 2.5 -4 Z" fill="#a7f3d0" opacity="0.8"/><path d="M22 40 c4.5 -0.4 6.5 4 3.4 7 c-3.2 3 -8.4 0.3 -7.4 -4 c0.4 -1.8 1.4 -2.8 4 -3 Z" fill="#a7f3d0" opacity="0.8"/><path d="M32 26 c2.6 -0.3 3.6 2 1.8 3.8 c-1.8 1.7 -4.6 0.2 -4 -2.2 c0.2 -1 0.8 -1.4 2.2 -1.6 Z" fill="#a7f3d0" opacity="0.65"/></svg>`;
const BEAN_URI = `data:image/svg+xml,${encodeURIComponent(BEAN_SVG)}`;

export function renderOgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #0f2233 0%, #1b3a57 100%)",
          color: "#ede4d1",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={BEAN_URI} width={210} height={210} alt="" style={{ marginRight: 40 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 128, fontWeight: 800, lineHeight: 1, letterSpacing: -3 }}>
              GeoBean
            </div>
            <div style={{ fontSize: 36, color: "#9fb3c8", marginTop: 16 }}>
              Compulsive geography
            </div>
          </div>
        </div>
        <div style={{ display: "flex", marginTop: 54, fontSize: 30, color: "#7fd8b0" }}>
          Map quizzes · Flags &amp; capitals · Continent builder
        </div>
      </div>
    ),
    { ...OG_SIZE }
  );
}
