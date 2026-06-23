import { renderOgImage, OG_SIZE, OG_ALT, OG_CONTENT_TYPE } from "@/lib/og";

export const size = OG_SIZE;
export const alt = OG_ALT;
export const contentType = OG_CONTENT_TYPE;

export default function TwitterImage() {
  return renderOgImage();
}
