// Region-level dpad adjacency for the "find on map" region picker. The country
// graph (@geobean/core buildFindGraph) handles within-region moves; this small
// layer handles the ~11 nav-regions themselves: from each region, n/e/s/w picks
// the nearest OTHER region in that compass quadrant, using the same true-bearing
// rule as the country graph (bearingDir on the regions' representative
// centroids). Only ~11 well-spread, always-visible nodes, so no strong-
// connectivity repair is needed — the reachability test asserts every region is
// dpad-reachable from every other.
//
// Centroids are [lng, lat] (mind the order); longitude deltas wrap the dateline
// so Oceania (near +180°) ranks sensibly against the Americas.

import {
  NAV_REGIONS,
  bearingDir,
  type NavRegion,
  type NavRegionId,
  type Dir,
  type Country,
} from "@geobean/core";

export type RegionDpad = Record<NavRegionId, Record<Dir, NavRegionId | null>>;

// bearingDir only reads `.centroid`; wrap a region as a minimal Country-like so
// the region layer reuses the same tested compass logic as the country graph.
const asPoint = (centroid: [number, number]): Country =>
  ({ centroid }) as unknown as Country;

/** Cheap squared distance with dateline-aware longitude — good enough to RANK
 *  candidate regions (no need for great-circle km here). */
function dist2(a: [number, number], b: [number, number]): number {
  let dLng = b[0] - a[0];
  while (dLng > 180) dLng -= 360;
  while (dLng <= -180) dLng += 360;
  const dLat = b[1] - a[1];
  return dLng * dLng + dLat * dLat;
}

/** For each region, the nearest other region in each of n/e/s/w (by true
 *  bearing), or null if no region lies in that quadrant. */
export function buildRegionDpad(regions: NavRegion[] = NAV_REGIONS): RegionDpad {
  const out = {} as RegionDpad;
  for (const from of regions) {
    const best: Record<Dir, { id: NavRegionId; d: number } | null> = {
      n: null,
      e: null,
      s: null,
      w: null,
    };
    for (const to of regions) {
      if (to.id === from.id) continue;
      const dir = bearingDir(asPoint(from.centroid), asPoint(to.centroid));
      const d = dist2(from.centroid, to.centroid);
      if (!best[dir] || d < best[dir]!.d) best[dir] = { id: to.id, d };
    }
    out[from.id] = {
      n: best.n?.id ?? null,
      e: best.e?.id ?? null,
      s: best.s?.id ?? null,
      w: best.w?.id ?? null,
    };
  }
  return out;
}

/** The nav-region nearest to screen-centre (lon/lat ≈ 0,0 under the map's
 *  equal-earth projection) — the sensible default the region picker starts on. */
export function defaultRegion(regions: NavRegion[] = NAV_REGIONS): NavRegionId {
  return regions.reduce((a, b) =>
    dist2([0, 0], b.centroid) < dist2([0, 0], a.centroid) ? b : a
  ).id;
}

/** The most-central member of a region — where country-nav starts once a region
 *  is chosen. Central (not westernmost) avoids dateline surprises for Oceania. */
export function regionStartCountry(
  members: Country[],
  regionCentroid: [number, number]
): Country {
  return members.reduce((best, c) =>
    dist2(regionCentroid, c.centroid as [number, number]) <
    dist2(regionCentroid, best.centroid as [number, number])
      ? c
      : best
  );
}
