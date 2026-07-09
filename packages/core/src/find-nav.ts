// Directional (dpad) navigation for "find on map". Two layers, both pure:
//
//   1. NAV REGIONS — every map-askable country lands in exactly one of ~11
//      spatial regions, derived from `subregion` (which composes cleanly) with
//      an override table for the handful of trans-continental edge cases.
//   2. A per-region DIRECTIONAL GRAPH — from any country, n/e/s/w moves to the
//      nearest country in that compass quadrant. The nearest-per-quadrant rule
//      alone can leave a country with no incoming edge, so a repair pass adds
//      the minimum extra edges needed to make every region strongly connected
//      (reachability is the hard guarantee the UI depends on).
//
// No DOM, no D3 — centroid geometry only, so it's unit-testable over the real
// dataset. Centroids are [lng, lat] (mind the order); longitude deltas are
// wrapped so the Pacific (Fiji/NZ/Kiribati near ±180°) behaves.

import type { Country } from "./types";
import { Logic } from "./logic";

// ---------------------------------------------------------------------------
// A. Nav regions
// ---------------------------------------------------------------------------

export type NavRegionId =
  | "northAmerica"
  | "latinAmerica"
  | "europe"
  | "westAsia"
  | "centralSouthAsia"
  | "eastSeAsia"
  | "northAfrica"
  | "westAfrica"
  | "centralAfrica"
  | "eastAfrica"
  | "oceania";

export interface NavRegion {
  id: NavRegionId;
  /** Rough representative position [lng, lat] for laying regions out on a dpad
   *  grid. Hand-set (not data-derived) so it's stable and dateline-safe; the UI
   *  only needs a coarse compass sense of where each region sits. */
  centroid: [number, number];
}

// Ordered roughly west→east, north→south — a sensible default reading order for
// the region picker. Centroids are approximate mid-points of each region.
export const NAV_REGIONS: NavRegion[] = [
  { id: "northAmerica", centroid: [-100, 40] },
  { id: "latinAmerica", centroid: [-65, -15] },
  { id: "europe", centroid: [15, 52] },
  { id: "northAfrica", centroid: [15, 27] },
  { id: "westAfrica", centroid: [-5, 12] },
  { id: "centralAfrica", centroid: [20, -10] },
  { id: "eastAfrica", centroid: [38, 0] },
  { id: "westAsia", centroid: [45, 30] },
  { id: "centralSouthAsia", centroid: [72, 30] },
  { id: "eastSeAsia", centroid: [115, 25] },
  { id: "oceania", centroid: [160, -20] },
];

// subregion → region. The mledoze 5.1.0 taxonomy is granular (six Europe
// subregions, "North America" vs "Caribbean", etc.), which lets almost every
// trans-continental country fall into a sensible home by subregion alone.
const SUBREGION_TO_REGION: Record<string, NavRegionId> = {
  // Americas
  "North America": "northAmerica",
  "Caribbean": "northAmerica",
  "Central America": "latinAmerica",
  "South America": "latinAmerica",
  // Europe (all six mledoze buckets)
  "Northern Europe": "europe",
  "Western Europe": "europe",
  "Central Europe": "europe",
  "Eastern Europe": "europe", // includes Russia — grouped with Europe by convention
  "Southern Europe": "europe", // includes Cyprus in this dataset
  "Southeast Europe": "europe",
  // Asia
  "Western Asia": "westAsia", // Middle East + Caucasus + Türkiye
  "Central Asia": "centralSouthAsia",
  "Southern Asia": "centralSouthAsia", // includes Iran here
  "Eastern Asia": "eastSeAsia",
  "South-Eastern Asia": "eastSeAsia",
  // Africa (sub-Saharan split three ways so no dpad region exceeds ~17 members)
  "Northern Africa": "northAfrica",
  "Western Africa": "westAfrica",
  "Middle Africa": "centralAfrica",
  "Southern Africa": "centralAfrica",
  "Eastern Africa": "eastAfrica",
  // Oceania
  "Australia and New Zealand": "oceania",
  "Melanesia": "oceania",
  "Micronesia": "oceania",
  "Polynesia": "oceania",
};

// Per-country home overrides (by cca3), for cases the subregion default gets
// wrong. Empty today: in this dataset the trans-continental countries
// (Russia→europe, Türkiye/Cyprus/Caucasus→westAsia|europe, Egypt→northAfrica,
// Kazakhstan→centralSouthAsia) already land sensibly via subregion. Kept as the
// documented extension point — membership is a discoverability choice, and
// reachability is guaranteed per-region regardless of which home a country gets.
const REGION_OVERRIDES: Record<string, NavRegionId> = {};

// Fallback for the rare subregion not in the table: bucket by coarse `region`
// so nothing is ever unassigned.
const REGION_FALLBACK: Record<string, NavRegionId> = {
  Americas: "latinAmerica",
  Europe: "europe",
  Asia: "centralSouthAsia",
  Africa: "eastAfrica",
  Oceania: "oceania",
};

/** The nav-region a country belongs to. Overrides win, then subregion, then a
 *  coarse region fallback (so every country resolves). */
export function navRegionOf(country: Country): NavRegionId {
  if (country.cca3 && REGION_OVERRIDES[country.cca3]) {
    return REGION_OVERRIDES[country.cca3];
  }
  const sub = country.subregion;
  if (sub && SUBREGION_TO_REGION[sub]) return SUBREGION_TO_REGION[sub];
  return REGION_FALLBACK[country.region] ?? "europe";
}

// ---------------------------------------------------------------------------
// B. Directional graph
// ---------------------------------------------------------------------------

export type Dir = "n" | "e" | "s" | "w";
export interface DirEdges {
  n: string | null;
  e: string | null;
  s: string | null;
  w: string | null;
}
export type FindGraph = Record<string, DirEdges>;

const DIRS: Dir[] = ["n", "e", "s", "w"];
const DEG = Math.PI / 180;

/** Signed longitude delta b−a wrapped to (−180, 180], so a country just west of
 *  the antimeridian isn't computed as far east of one just east of it. */
function dLng(aLng: number, bLng: number): number {
  let d = bLng - aLng;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

/** Great-circle distance (km) between two [lng, lat] centroids. */
function gcKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[1] - a[1]) * DEG;
  const dLon = dLng(a[0], b[0]) * DEG;
  const la1 = a[1] * DEG;
  const la2 = b[1] * DEG;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass quadrant of b as seen from a. East component is scaled by cos(lat)
 *  so the 45° diagonals are geographically meaningful (a degree of longitude is
 *  shorter than a degree of latitude away from the equator). Splits at the
 *  diagonals: N=[-45,45), E=[45,135), S=[135,180]∪[-180,-135), W=[-135,-45). */
function quadrant(a: [number, number], b: [number, number]): Dir {
  const east = dLng(a[0], b[0]) * Math.cos(((a[1] + b[1]) / 2) * DEG);
  const north = b[1] - a[1];
  const deg = (Math.atan2(east, north) / DEG + 360) % 360; // 0=N, 90=E, 180=S, 270=W
  if (deg >= 45 && deg < 135) return "e";
  if (deg >= 135 && deg < 225) return "s";
  if (deg >= 225 && deg < 315) return "w";
  return "n";
}

// A near-tie: two candidates in the same direction whose distances are within
// this margin. Only then does the user's tie-break decide between them.
const TIE_KM = 250;

/** For a set of same-quadrant candidates, pick the target. Nearest wins; among
 *  near-ties (within TIE_KM of the nearest) apply the directional tie-break:
 *  going E/W prefer the northernmost, going N/S prefer the westernmost. */
function pickInDirection(
  from: Country,
  dir: Dir,
  candidates: Country[]
): string | null {
  if (!candidates.length) return null;
  const c0 = from.centroid as [number, number];
  const withDist = candidates.map((c) => ({
    c,
    d: gcKm(c0, c.centroid as [number, number]),
  }));
  withDist.sort((x, y) => x.d - y.d);
  const best = withDist[0].d;
  const tied = withDist.filter((x) => x.d <= best + TIE_KM).map((x) => x.c);
  if (tied.length === 1) return tied[0].id;
  const lat = (c: Country) => (c.centroid as [number, number])[1];
  const lng = (c: Country) => (c.centroid as [number, number])[0];
  const winner =
    dir === "e" || dir === "w"
      ? tied.reduce((a, b) => (lat(b) > lat(a) ? b : a)) // northernmost
      : tied.reduce((a, b) => (lng(b) < lng(a) ? b : a)); // westernmost
  return winner.id;
}

/** Base directional edges for one region (before reachability repair). */
function baseEdges(members: Country[]): FindGraph {
  const g: FindGraph = {};
  for (const from of members) {
    const buckets: Record<Dir, Country[]> = { n: [], e: [], s: [], w: [] };
    for (const to of members) {
      if (to.id === from.id) continue;
      buckets[
        quadrant(from.centroid as [number, number], to.centroid as [number, number])
      ].push(to);
    }
    g[from.id] = {
      n: pickInDirection(from, "n", buckets.n),
      e: pickInDirection(from, "e", buckets.e),
      s: pickInDirection(from, "s", buckets.s),
      w: pickInDirection(from, "w", buckets.w),
    };
  }
  return g;
}

// ---------------------------------------------------------------------------
// C. Reachability: strongly-connected components + repair
// ---------------------------------------------------------------------------

/** Tarjan SCC over the directed 4-dir graph, restricted to `ids`. Returns the
 *  components (each a list of node ids). */
function stronglyConnected(ids: string[], g: FindGraph): string[][] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const comps: string[][] = [];
  let idx = 0;
  const idSet = new Set(ids);

  // Iterative Tarjan (regions are small, but avoid any recursion-depth risk).
  for (const start of ids) {
    if (index.has(start)) continue;
    const work: { v: string; i: number }[] = [{ v: start, i: 0 }];
    while (work.length) {
      const frame = work[work.length - 1];
      const v = frame.v;
      if (frame.i === 0) {
        index.set(v, idx);
        low.set(v, idx);
        idx++;
        stack.push(v);
        onStack.add(v);
      }
      const succ = DIRS.map((d) => g[v][d]).filter(
        (t): t is string => !!t && idSet.has(t)
      );
      if (frame.i < succ.length) {
        const w = succ[frame.i];
        frame.i++;
        if (!index.has(w)) {
          work.push({ v: w, i: 0 });
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v)!, index.get(w)!));
        }
      } else {
        if (low.get(v) === index.get(v)) {
          const comp: string[] = [];
          for (;;) {
            const w = stack.pop()!;
            onStack.delete(w);
            comp.push(w);
            if (w === v) break;
          }
          comps.push(comp);
        }
        work.pop();
        if (work.length) {
          const parent = work[work.length - 1].v;
          low.set(parent, Math.min(low.get(parent)!, low.get(v)!));
        }
      }
    }
  }
  return comps;
}

/** Place a repair edge from→to on `from`, preferring the direction matching the
 *  true bearing, then any free slot, and only overwriting as a last resort.
 *  Returns true if the edge was recorded on a previously-null slot (i.e. cheap). */
function addEdge(from: Country, to: Country, g: FindGraph): void {
  const e = g[from.id];
  const want = quadrant(from.centroid as [number, number], to.centroid as [number, number]);
  if (e[want] === null) {
    e[want] = to.id;
    return;
  }
  // Bearing slot taken — use the nearest free direction (by compass order).
  const order: Record<Dir, Dir[]> = {
    n: ["e", "w", "s"],
    e: ["n", "s", "w"],
    s: ["e", "w", "n"],
    w: ["n", "s", "e"],
  };
  for (const d of order[want]) {
    if (e[d] === null) {
      e[d] = to.id;
      return;
    }
  }
  // All four occupied (very rare) — overwrite the bearing slot.
  e[want] = to.id;
}

/** True if `from` has a free directional slot. */
function hasFreeSlot(e: DirEdges): boolean {
  return DIRS.some((d) => e[d] === null);
}

/**
 * Stitch a region's SCCs into a single strongly-connected component by adding a
 * cycle over the condensation: comp0 → comp1 → … → compK → comp0. Each link is
 * the nearest cross-component country pair whose source still has a free slot,
 * so within-SCC reachability plus the cycle makes every country reachable from
 * every other. Returns the number of repair edges added.
 */
function repairRegion(members: Country[], g: FindGraph): number {
  const byId = new Map(members.map((c) => [c.id, c]));
  const ids = members.map((c) => c.id);
  let added = 0;

  for (let guard = 0; guard < members.length + 2; guard++) {
    const comps = stronglyConnected(ids, g);
    if (comps.length <= 1) break;
    // Order components by centroid longitude for a stable, roughly W→E cycle.
    const compCentroid = (comp: string[]): number =>
      comp.reduce((s, id) => s + (byId.get(id)!.centroid as [number, number])[0], 0) /
      comp.length;
    comps.sort((a, b) => compCentroid(a) - compCentroid(b));

    // Add one link per consecutive pair (cyclically) — enough to fuse all SCCs.
    for (let i = 0; i < comps.length; i++) {
      const src = comps[i];
      const dst = comps[(i + 1) % comps.length];
      let bestU: Country | null = null;
      let bestV: Country | null = null;
      let bestD = Infinity;
      for (const uId of src) {
        const u = byId.get(uId)!;
        if (!hasFreeSlot(g[uId])) continue;
        for (const vId of dst) {
          const v = byId.get(vId)!;
          const d = gcKm(u.centroid as [number, number], v.centroid as [number, number]);
          if (d < bestD) {
            bestD = d;
            bestU = u;
            bestV = v;
          }
        }
      }
      // Fallback: no free-slot source in this component — allow overwrite.
      if (!bestU) {
        for (const uId of src) {
          const u = byId.get(uId)!;
          for (const vId of dst) {
            const v = byId.get(vId)!;
            const d = gcKm(u.centroid as [number, number], v.centroid as [number, number]);
            if (d < bestD) {
              bestD = d;
              bestU = u;
              bestV = v;
            }
          }
        }
      }
      if (bestU && bestV) {
        addEdge(bestU, bestV, g);
        added++;
      }
    }
  }
  return added;
}

export interface FindGraphResult {
  graph: FindGraph;
  /** Members (map-askable country ids) per region. */
  regions: Record<NavRegionId, string[]>;
  /** Repair edges added per region to guarantee strong connectivity. */
  repairs: Record<string, number>;
}

/**
 * Build the directional find-graph over the map-askable countries. Edges only
 * connect countries in the same nav-region; within every region the returned
 * graph is guaranteed strongly connected (validated + repaired here, proven by
 * the reachability test).
 */
export function buildFindGraph(countries: Country[]): FindGraphResult {
  const pool = Logic.mapPool(countries).filter(
    (c) => c.centroid && !isNaN(c.centroid[0])
  );
  const groups = new Map<NavRegionId, Country[]>();
  for (const c of pool) {
    const r = navRegionOf(c);
    (groups.get(r) ?? groups.set(r, []).get(r)!).push(c);
  }

  const graph: FindGraph = {};
  const regions = {} as Record<NavRegionId, string[]>;
  const repairs: Record<string, number> = {};

  for (const [regionId, members] of groups) {
    const sub = baseEdges(members);
    Object.assign(graph, sub);
    repairs[regionId] = members.length > 1 ? repairRegion(members, sub) : 0;
    regions[regionId] = members.map((c) => c.id);
  }
  return { graph, regions, repairs };
}
