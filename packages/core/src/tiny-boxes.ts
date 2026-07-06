// Pure tiny-island geometry: which countries count as "tiny", where their
// outline boxes go, and how a click/cursor point resolves to a country.
// Lifted verbatim (math only, no D3 drawing/selections) from apps/web's
// map-view.ts so the web map and any other renderer (e.g. the TV find-quiz)
// share exactly the same hit-resolution.
import { geoPath, geoArea } from "d3-geo";
import type { GeoProjection } from "d3-geo";
import type { Feature, Polygon } from "geojson";
import { Logic } from "./logic";
import type { Country } from "./types";

export interface TinyBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

// Padded outline boxes framing tiny countries, in unzoomed projected
// coordinates. BOX_PAD is added around the island's own bounding box;
// BOX_MAX_HALF caps an isolated box; BOX_MIN_HALF floors it so an island that
// hugs a mainland (Singapore) still gets a clickable box.
const BOX_PAD = 8;
const BOX_MAX_HALF = 16;
const BOX_MIN_HALF = 4;

// The projected area (px²) and bounding box of a feature's largest polygon —
// its biggest single landmass on screen. Used both to decide whether a country
// is a tiny island and to frame the outline box on that landmass (not the whole
// scattered multipolygon, whose centre can be open ocean).
function largestPolygon(
  path: ReturnType<typeof geoPath>,
  feature: Feature
): { area: number; bounds: [[number, number], [number, number]] } | null {
  const g = feature.geometry;
  const rings =
    g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  let best: Polygon | null = null;
  let bestArea = -1;
  for (const coordinates of rings) {
    const poly: Polygon = { type: "Polygon", coordinates };
    const a = path.area(poly as never);
    if (a > bestArea) {
      bestArea = a;
      best = poly;
    }
  }
  return best
    ? { area: bestArea, bounds: path.bounds(best as never) as [[number, number], [number, number]] }
    : null;
}

// Projected exterior-ring vertices of every country with geometry, tagged with
// the owning country id. Used to clamp island boxes off foreign coastlines.
// Subsampled (every 2nd vertex) — coastlines are dense at 50m, so this stays
// accurate while keeping the one-off cost low.
function coastVertices(
  countries: Country[],
  projection: GeoProjection
): { x: number; y: number; id: string }[] {
  const pts: { x: number; y: number; id: string }[] = [];
  for (const c of countries) {
    if (!c.feature) continue;
    const g = c.feature.geometry;
    const polys =
      g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
    for (const poly of polys) {
      const ring = poly[0]; // exterior ring
      for (let i = 0; i < ring.length; i += 2) {
        const p = projection(ring[i] as [number, number]);
        if (p && isFinite(p[0]) && isFinite(p[1])) pts.push({ x: p[0], y: p[1], id: c.id });
      }
    }
  }
  return pts;
}

/** Which countries count as tiny (drives name-mode close-framing), and which
 *  tiny ISLANDS get an outline box (no land border). Pure.
 *
 *  The original (map-view.ts) judges tininess by a specific equal-area
 *  projection's *projected* area as a fraction of the projected sphere. For
 *  an equal-area projection (geoEqualEarth) that ratio is, by definition,
 *  identical to the ratio of spherical areas — so using d3-geo's
 *  projection-independent `geoArea` here reproduces the same tiny set
 *  without requiring callers to supply a projection, which the signature
 *  (Task 12 needs this projection-agnostic) doesn't have room for. */
export function computeTinyIds(countries: Country[]): Set<string> {
  const sphereArea = geoArea({ type: "Sphere" } as never);
  const tinyIds = new Set<string>();
  for (const c of countries) {
    if (!c.feature) {
      tinyIds.add(c.id); // no polygon at all (e.g. Tuvalu) — treat as tiny
      continue;
    }
    const area = largestPolygonSphericalArea(c.feature);
    if (area != null && !Logic.isTiny(area / sphereArea)) continue;
    tinyIds.add(c.id);
  }
  return tinyIds;
}

// Largest polygon's spherical area (steradians), via d3-geo's
// projection-independent geoArea.
function largestPolygonSphericalArea(feature: Feature): number | null {
  const g = feature.geometry;
  const rings =
    g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  if (!rings.length) return null;
  let bestArea = -1;
  for (const coordinates of rings) {
    const poly: Polygon = { type: "Polygon", coordinates };
    const a = geoArea(poly as never);
    if (a > bestArea) bestArea = a;
  }
  return bestArea;
}

/** Padded, mutually non-overlapping, coast-clamped outline boxes for tiny
 *  islands, in projected (unzoomed) coordinates. Lifted verbatim from
 *  map-view.ts init — including coastVertices. */
export function layoutTinyBoxes(
  countries: Country[],
  tinyIds: Set<string>,
  projection: GeoProjection,
  opts: { boxSize?: number } = {}
): TinyBox[] {
  const path = geoPath(projection);
  // Sphere area normalises the box sizing so it's viewport-independent, and its
  // square root scales the box padding/caps with the map's linear size so boxes
  // stay proportionally the same on a phone and a wide monitor.
  const sphereArea = path.area({ type: "Sphere" } as never) || 1;
  const scale = (opts.boxSize ?? 1) * Math.sqrt(sphereArea / 859371); // 859371 = sphere px² at the 1440×810 reference
  const boxPad = BOX_PAD * scale;
  const boxMaxHalf = BOX_MAX_HALF * scale;
  const boxMinHalf = BOX_MIN_HALF * scale;

  const islands: { c: Country; cx: number; cy: number; desired: number }[] = [];
  for (const c of countries) {
    if (!tinyIds.has(c.id)) continue;
    if ((c._borders?.length ?? 0) !== 0) continue; // only tiny ISLANDS get a box
    if (!c.centroid) continue;
    const p = projection(c.centroid);
    if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
    // Frame and centre the box on the largest island (not the whole scattered
    // multipolygon), so the box sits on real land and reveals it when zoomed.
    let cx = p[0],
      cy = p[1],
      extent = 0;
    const lp = c.feature ? largestPolygon(path, c.feature) : null;
    if (lp) {
      const [[x0, y0], [x1, y1]] = lp.bounds;
      cx = (x0 + x1) / 2;
      cy = (y0 + y1) / 2;
      extent = Math.max(x1 - x0, y1 - y0) / 2;
    }
    islands.push({ c, cx, cy, desired: Math.min(extent + boxPad, boxMaxHalf) });
  }

  // Two clamps, each only ever shrinking a box: (1) so no two island boxes
  // overlap, and (2) so a box doesn't spill onto a neighbouring country's
  // coastline (Chebyshev distance, since the box is a square). An island that
  // hugs a mainland keeps a floor so it stays clickable, at the cost of a small
  // unavoidable overlap.
  const centers = islands.map((t) => ({ x: t.cx, y: t.cy }));
  const halves = Logic.boxHalfSizesNoOverlap(centers, islands.map((t) => t.desired));
  const coast = coastVertices(countries, projection);
  return islands.map((t, i) => {
    let half = halves[i];
    let nearest = Infinity;
    for (const v of coast) {
      if (v.id === t.c.id) continue;
      const cheb = Math.max(Math.abs(v.x - t.cx), Math.abs(v.y - t.cy));
      if (cheb < nearest) nearest = cheb;
    }
    half = Math.min(half, Math.max(nearest, boxMinHalf));
    return { id: t.c.id, x: t.cx - half, y: t.cy - half, w: half * 2, h: half * 2 };
  });
}

/** Resolve a click/cursor point (projected, unzoomed coords) to a country:
 *  point-in-tiny-box first, then nearest projected centroid within
 *  `maxDistPx`, else null. */
export function resolvePoint(
  pt: [number, number],
  boxes: TinyBox[],
  countries: Country[],
  projection: GeoProjection,
  maxDistPx: number
): Country | null {
  const [x, y] = pt;
  const byId = new Map(countries.map((c) => [c.id, c]));
  for (const b of boxes) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      const c = byId.get(b.id);
      if (c) return c;
    }
  }
  const sites: { x: number; y: number; country: Country }[] = [];
  for (const c of countries) {
    if (!c.centroid) continue;
    const p = projection(c.centroid);
    if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
    sites.push({ x: p[0], y: p[1], country: c });
  }
  if (!sites.length) return null;
  const i = Logic.nearestWithin(sites, x, y, maxDistPx);
  return i >= 0 ? sites[i].country : null;
}
