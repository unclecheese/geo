// Custom geometry fixes for the Continent Builder, kept pure (lon/lat in,
// GeoJSON out) so they can be unit-tested without D3 or the DOM.
//
// Two problems this solves for the Europe build:
//   1. Russia spans Europe and Asia; in the Europe builder we only want the
//      European part (west of the Urals, ~60°E) so it doesn't dwarf the map.
//   2. world-atlas draws Crimea as part of Russia. Crimea is Ukraine — so we
//      cut it out of Russia and graft it onto Ukraine.
import type { Feature, MultiPolygon, Polygon, Position } from "geojson";

export const RU_CCN3 = "643";
export const UA_CCN3 = "804";

type Ring = Position[];
type Rect = [number, number, number, number]; // [minX, minY, maxX, maxY]

// The Urals sit near 60°E; everything west of that is European Russia. No west
// bound is needed once the antimeridian is unwrapped (Kaliningrad survives).
const EUROPE_RECT: Rect = [-180, 40, 60, 84];

// Crimea's bounding box (lon 32.5–36.6, lat 44.4–46.2). The peninsula is a
// standalone polygon in Russia's MultiPolygon, so a bbox test isolates it.
const CRIMEA_BOX: Rect = [30, 43, 38, 47];

function ringBox(ring: Ring): Rect {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
  for (const pt of ring) {
    const x = pt[0], y = pt[1];
    if (x < x0) x0 = x;
    if (y < y0) y0 = y;
    if (x > x1) x1 = x;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(a / 2);
}

// Russia's only negative longitudes are the Chukotka/Diomede tip across the
// antimeridian. Shift them by +360 so a single polygon has no ±180 seam (which
// would otherwise make a rectangular clip bridge spurious slivers).
export function unwrapAntimeridian(ring: Ring): Ring {
  return ring.map((pt) => [pt[0] < -100 ? pt[0] + 360 : pt[0], pt[1]]);
}

// Sutherland–Hodgman clip of a single ring against an axis-aligned rectangle.
export function clipRingToRect(ring: Ring, rect: Rect): Ring {
  const [minX, minY, maxX, maxY] = rect;
  const ix = (a: Position, b: Position, x: number): Position => {
    const t = (x - a[0]) / (b[0] - a[0]);
    return [x, a[1] + t * (b[1] - a[1])];
  };
  const iy = (a: Position, b: Position, y: number): Position => {
    const t = (y - a[1]) / (b[1] - a[1]);
    return [a[0] + t * (b[0] - a[0]), y];
  };
  const clip = (
    pts: Ring,
    inside: (p: Position) => boolean,
    cut: (a: Position, b: Position) => Position
  ): Ring => {
    const out: Ring = [];
    const n = pts.length;
    if (!n) return out;
    for (let i = 0; i < n; i++) {
      const cur = pts[i], prev = pts[(i + n - 1) % n];
      const cin = inside(cur), pin = inside(prev);
      if (cin) {
        if (!pin) out.push(cut(prev, cur));
        out.push(cur);
      } else if (pin) {
        out.push(cut(prev, cur));
      }
    }
    return out;
  };
  // Work on an open ring (drop the duplicate closing vertex).
  let r: Ring = ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
    ? ring.slice(0, -1)
    : ring.slice();
  r = clip(r, (p) => p[0] >= minX, (a, b) => ix(a, b, minX));
  r = clip(r, (p) => p[0] <= maxX, (a, b) => ix(a, b, maxX));
  r = clip(r, (p) => p[1] >= minY, (a, b) => iy(a, b, minY));
  r = clip(r, (p) => p[1] <= maxY, (a, b) => iy(a, b, maxY));
  return r.length ? [...r, r[0]] : [];
}

function polygons(f: Feature): Position[][][] {
  const g = f.geometry;
  if (g.type === "Polygon") return [g.coordinates];
  if (g.type === "MultiPolygon") return g.coordinates;
  return [];
}

function isCrimea(poly: Position[][]): boolean {
  const b = ringBox(poly[0]);
  return b[0] > CRIMEA_BOX[0] && b[2] < CRIMEA_BOX[2] && b[1] > CRIMEA_BOX[1] && b[3] < CRIMEA_BOX[3];
}

// The Crimea polygon lifted out of Russia (outer ring only), or null.
export function crimeaPolygon(ru: Feature): Position[][] | null {
  for (const poly of polygons(ru)) if (isCrimea(poly)) return [poly[0]];
  return null;
}

// Russia clipped to its European extent: each outer ring is unwrapped, then
// rectangle-clipped to west-of-the-Urals; Crimea and degenerate slivers drop.
export function europeanRussia(ru: Feature): Feature {
  const out: Position[][][] = [];
  for (const poly of polygons(ru)) {
    if (isCrimea(poly)) continue;
    const clipped = clipRingToRect(unwrapAntimeridian(poly[0]), EUROPE_RECT);
    if (clipped.length >= 4 && ringArea(clipped) > 0.02) out.push([clipped]);
  }
  return {
    type: "Feature",
    id: ru.id,
    properties: ru.properties,
    geometry: { type: "MultiPolygon", coordinates: out } as MultiPolygon,
  };
}

// Ukraine with Crimea grafted back on.
export function ukraineWithCrimea(ua: Feature, ru: Feature): Feature {
  const crimea = crimeaPolygon(ru);
  const polys: Position[][][] = polygons(ua).map((p) => p);
  if (crimea) polys.push(crimea);
  return {
    type: "Feature",
    id: ua.id,
    properties: ua.properties,
    geometry:
      polys.length === 1
        ? ({ type: "Polygon", coordinates: polys[0] } as Polygon)
        : ({ type: "MultiPolygon", coordinates: polys } as MultiPolygon),
  };
}
