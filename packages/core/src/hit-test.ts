// Pure cursor-point → country resolution, shared by any renderer (the web
// map's click handler and the TV find-quiz's cursor-select both need the same
// answer for "what did the player point at").
import { geoContains } from "d3-geo";
import type { GeoProjection } from "d3-geo";
import { resolvePoint, type TinyBox } from "./tiny-boxes";
import type { Country } from "./types";

/** Resolve a projected (unzoomed) point to a country: tiny-box first, then
 *  polygon containment via geoContains on the inverted point, then nearest
 *  projected centroid within maxDistPx. Null in open ocean.
 *
 *  Box precedence matters: an island's outline box can overlap a mainland
 *  neighbour's polygon (see tiny-boxes.ts's coastal clamp), so the box must
 *  win over containment, not just break ties.
 *
 *  Composes with resolvePoint (Task 5) rather than duplicating its
 *  nearest-centroid search: the box pass here is resolvePoint's own box
 *  check (needed standalone since containment must run *between* boxes and
 *  centroid fallback), and step 3 delegates to resolvePoint with an empty
 *  `boxes` array so it degrades to pure centroid-nearest — reusing that code
 *  exactly once, not re-running the box pass. */
export function pickCountryAt(
  ptProjected: [number, number],
  countries: Country[],
  boxes: TinyBox[],
  projection: GeoProjection,
  maxDistPx = 24
): Country | null {
  const [x, y] = ptProjected;

  const byId = new Map(countries.map((c) => [c.id, c]));
  for (const b of boxes) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      const c = byId.get(b.id);
      if (c) return c;
    }
  }

  if (projection.invert) {
    const lonlat = projection.invert(ptProjected);
    if (lonlat && isFinite(lonlat[0]) && isFinite(lonlat[1])) {
      for (const c of countries) {
        if (!c.feature) continue;
        if (geoContains(c.feature as never, lonlat as never)) return c;
      }
    }
  }

  return resolvePoint(ptProjected, [], countries, projection, maxDistPx);
}
