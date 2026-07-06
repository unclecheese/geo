import { Skia, type SkPath } from "@shopify/react-native-skia";
import { geoPath } from "d3-geo";
import type { GeoProjection } from "d3-geo";
import type { Feature } from "geojson";

/**
 * Minimal GeoContext bridging d3-geo → Skia. `geoPath(projection, context)`
 * drives a canvas-ish context: for polygons it emits moveTo/lineTo/closePath,
 * and arc() only for point sprites (unused here — we draw no point features).
 * We accumulate the calls into a single Skia SkPath.
 */
export class SkiaPathContext {
  path: SkPath = Skia.Path.Make();
  moveTo(x: number, y: number) {
    this.path.moveTo(x, y);
  }
  lineTo(x: number, y: number) {
    this.path.lineTo(x, y);
  }
  closePath() {
    this.path.close();
  }
  arc(x: number, y: number, r: number, a0: number, a1: number) {
    this.path.addArc(
      { x: x - r, y: y - r, width: 2 * r, height: 2 * r },
      (a0 * 180) / Math.PI,
      ((a1 - a0) * 180) / Math.PI
    );
  }
}

/**
 * One Skia path per country, keyed by padded ccn3. Built once per session
 * (the projection is fixed; zoom/pan happen via the transform group, not by
 * re-projecting). Keyed off `featureById` so the world-atlas id collisions
 * (dup "036", the five id-less features) are already resolved upstream.
 */
export function buildCountryPaths(
  projection: GeoProjection,
  featureById: Map<string, Feature>
): Map<string, SkPath> {
  const out = new Map<string, SkPath>();
  for (const [id, f] of featureById) {
    const ctx = new SkiaPathContext();
    geoPath(projection, ctx as never)(f as never);
    out.set(id, ctx.path);
  }
  return out;
}
