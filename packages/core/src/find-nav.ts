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

// Seven coarse regions (the finer 11-region split proved fussier than players
// wanted to dpad through). Each map-askable country lands in exactly one.
export type NavRegionId =
  | "northAmerica" // Northern America + Caribbean (Mexico sits here in this dataset)
  | "latinAmerica" // Central + South America
  | "africa" // all of Africa
  | "europe" // all of Europe, minus Russia
  | "eastAsia" // Russia + East + Central Asia + Nepal + mainland SE Asia
  | "southAsiaMideast" // Western + Southern Asia (Middle East, Caucasus, subcontinent)
  | "oceania"; // Australasia + Pacific + maritime SE Asia

export interface NavRegion {
  id: NavRegionId;
  /** Rough representative position [lng, lat] for laying regions out on a dpad
   *  grid. Hand-set (not data-derived) so it's stable and dateline-safe; the UI
   *  only needs a coarse compass sense of where each region sits. */
  centroid: [number, number];
}

// Ordered roughly west→east — a sensible default reading order for the region
// picker. Centroids are approximate mid-points of each (large) region.
export const NAV_REGIONS: NavRegion[] = [
  { id: "northAmerica", centroid: [-100, 40] },
  { id: "latinAmerica", centroid: [-60, -15] },
  { id: "europe", centroid: [15, 52] },
  { id: "africa", centroid: [20, 3] },
  { id: "southAsiaMideast", centroid: [62, 27] },
  { id: "eastAsia", centroid: [100, 42] },
  { id: "oceania", centroid: [135, -10] },
];

// subregion → region base map. South-Eastern Asia is deliberately absent: it has
// no clean rule (mainland goes east, maritime goes to Oceania), so every SE Asia
// country is placed by explicit override below.
const SUBREGION_TO_REGION: Record<string, NavRegionId> = {
  // Americas
  "North America": "northAmerica", // includes Mexico in this dataset
  "Caribbean": "northAmerica",
  "Central America": "latinAmerica",
  "South America": "latinAmerica",
  // Europe (all six mledoze buckets; Russia moved out by override)
  "Northern Europe": "europe",
  "Western Europe": "europe",
  "Central Europe": "europe",
  "Eastern Europe": "europe",
  "Southern Europe": "europe", // includes Cyprus in this dataset
  "Southeast Europe": "europe",
  // Asia
  "Eastern Asia": "eastAsia",
  "Central Asia": "eastAsia", // Turkmenistan moved to southAsiaMideast by override
  "Western Asia": "southAsiaMideast", // Middle East + Caucasus + Türkiye
  "Southern Asia": "southAsiaMideast", // subcontinent + Iran; Nepal moved by override
  // Africa (all merged into one region)
  "Northern Africa": "africa",
  "Western Africa": "africa",
  "Middle Africa": "africa",
  "Eastern Africa": "africa",
  "Southern Africa": "africa",
  // Oceania
  "Australia and New Zealand": "oceania",
  "Melanesia": "oceania",
  "Micronesia": "oceania",
  "Polynesia": "oceania",
};

// Per-country home overrides (by cca3). Two kinds: trans-continental moves, and
// the per-country South-Eastern Asia split (no clean subregion rule). Membership
// is a discoverability choice; reachability is guaranteed per-region regardless.
const REGION_OVERRIDES: Record<string, NavRegionId> = {
  MEX: "northAmerica", // no-op here (already "North America"), kept to pin intent
  CYP: "europe", // no-op here (already "Southern Europe"), kept to pin intent
  RUS: "eastAsia", // "Eastern Europe" by subregion, but its landmass reads east
  TKM: "southAsiaMideast", // Central Asian, grouped with the subcontinent/Mideast
  NPL: "eastAsia", // Himalayan neighbour of China/Tibet rather than the subcontinent
  // South-Eastern Asia split — mainland to eastAsia:
  THA: "eastAsia",
  VNM: "eastAsia",
  LAO: "eastAsia",
  KHM: "eastAsia",
  MMR: "eastAsia",
  PHL: "eastAsia",
  // …maritime to oceania:
  MYS: "oceania",
  IDN: "oceania",
  SGP: "oceania",
  BRN: "oceania",
  TLS: "oceania",
};

// Fallback for a subregion not in the table (e.g. an as-yet-unlisted SE Asia
// country) so nothing is ever unassigned.
const REGION_FALLBACK: Record<string, NavRegionId> = {
  Americas: "latinAmerica",
  Europe: "europe",
  Asia: "eastAsia",
  Africa: "africa",
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

/** The true compass direction of `to` as seen from `from` (by centroid). Every
 *  n/e/s/w edge in the graph — base or repair — points to a country that lies in
 *  this direction, so the UI can animate the dpad move truthfully. */
export function bearingDir(from: Country, to: Country): Dir {
  return quadrant(from.centroid as [number, number], to.centroid as [number, number]);
}

/** The slot a repair edge from→to must occupy: its TRUE compass bearing. */
function edgeSlot(from: Country, to: Country): Dir {
  return bearingDir(from, to);
}

/** Place a repair edge from→to in the slot equal to its true bearing. A repair
 *  edge is only ever labelled by real direction — never a contradicting slot —
 *  so the dpad never sends "east" to a country that lies west. If that slot is
 *  already taken we OVERWRITE it (a same-direction edge is still truthful; the
 *  displaced neighbour stays reachable multi-hop, and the caller re-validates
 *  strong connectivity so nothing is stranded). */
function addEdge(from: Country, to: Country, g: FindGraph): void {
  g[from.id][edgeSlot(from, to)] = to.id;
}

/**
 * Stitch a region's SCCs into a single strongly-connected component by adding a
 * cycle over the condensation: comp0 → comp1 → … → compK → comp0. Each link is
 * the nearest cross-component country pair, preferring one whose true-bearing
 * slot is still free (so no existing edge is discarded), else overwriting that
 * slot. Every repair edge is placed by real bearing, and strong connectivity is
 * re-validated after each pass — so within-SCC reachability plus the cycle makes
 * every country reachable from every other. Returns the repair edges added.
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
      // Nearest pair whose bearing slot is free (no overwrite), and — as a
      // fallback — nearest pair regardless. Both keep the edge truthful.
      let freeU: Country | null = null, freeV: Country | null = null, freeD = Infinity;
      let anyU: Country | null = null, anyV: Country | null = null, anyD = Infinity;
      for (const uId of src) {
        const u = byId.get(uId)!;
        for (const vId of dst) {
          const v = byId.get(vId)!;
          const d = gcKm(u.centroid as [number, number], v.centroid as [number, number]);
          if (d < anyD) {
            anyD = d;
            anyU = u;
            anyV = v;
          }
          if (g[uId][edgeSlot(u, v)] === null && d < freeD) {
            freeD = d;
            freeU = u;
            freeV = v;
          }
        }
      }
      const u = freeU ?? anyU;
      const v = freeV ?? anyV;
      if (u && v) {
        addEdge(u, v, g);
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

// ---------------------------------------------------------------------------
// D. Framing: dominant cluster (antimeridian)
// ---------------------------------------------------------------------------

/**
 * Given the screen-x positions of a region's members, return a keep-mask that
 * selects the dominant on-screen cluster. A region that straddles the
 * antimeridian (Oceania: maritime SE Asia near +180° vs. Polynesia near -180°)
 * has its members thrown to opposite edges by a 0°-centred projection, so the
 * naïve bounding box spans nearly the whole width and can't be zoomed into.
 *
 * The positions are sorted and split at their single widest gap: if that gap is
 * at least `gapThreshold` the smaller side is a trans-dateline minority and is
 * dropped (the caller frames the majority; pan-follow reaches the rest); if the
 * widest gap is below the threshold the members form one cluster and all are
 * kept — so compact regions are unaffected. Tie-break when the two sides have
 * equal counts: keep the side spanning the wider x-range (more of the region);
 * if the spans tie too, keep the higher-x (right) side.
 *
 * Pure — screen-x numbers only, no projection or Country dependency.
 */
export function dominantCluster(xs: number[], gapThreshold: number): boolean[] {
  const n = xs.length;
  if (n <= 1) return xs.map(() => true);

  const order = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b]);
  // The single widest gap between consecutive sorted positions; the split falls
  // between order[splitAt] and order[splitAt + 1].
  let splitAt = -1;
  let maxGap = -Infinity;
  for (let i = 0; i < n - 1; i++) {
    const gap = xs[order[i + 1]] - xs[order[i]];
    if (gap > maxGap) {
      maxGap = gap;
      splitAt = i;
    }
  }
  if (maxGap < gapThreshold) return xs.map(() => true);

  const left = order.slice(0, splitAt + 1); // lower x
  const right = order.slice(splitAt + 1); // higher x
  const span = (g: number[]) => xs[g[g.length - 1]] - xs[g[0]]; // g is x-sorted
  let keepRight: boolean;
  if (right.length !== left.length) {
    keepRight = right.length > left.length;
  } else {
    const sr = span(right);
    const sl = span(left);
    keepRight = sr !== sl ? sr > sl : true; // wider span; final tie → higher-x
  }
  const keep = new Set(keepRight ? right : left);
  return xs.map((_, i) => keep.has(i));
}
