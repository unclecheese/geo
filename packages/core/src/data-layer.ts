import { geoArea, geoCentroid } from "d3-geo";
import { feature } from "topojson-client";
import type { Feature, Polygon, Position } from "geojson";
import { DATA_KEY, REST_URL, TOPO_URL } from "./constants";
import { EXTRA_SOVEREIGN } from "./modes";
import type { Country } from "./types";
import { getKVStorage } from "./platform";

// The mledoze/countries record shape, loosely typed to what we read.
interface RawMeta {
  ccn3?: string;
  cca2?: string;
  cca3?: string;
  name?: { common?: string; official?: string };
  capital?: string[];
  region?: string;
  subregion?: string;
  flag?: string;
  area?: number;
  latlng?: [number, number];
  borders?: string[];
  unMember?: boolean;
  independent?: boolean;
}

// Minimal TopoJSON shape — enough to extract features and retain the topology.
type Topo = {
  objects: { countries: unknown };
  arcs: unknown[];
  [k: string]: unknown;
};

interface CacheBlob {
  topo: Topo;
  meta: RawMeta[];
  t: number;
}

/**
 * Geographic centroid ([lng, lat]) of a feature's largest polygon. For a plain
 * Polygon this is just its centroid; for a MultiPolygon it picks the biggest
 * ring by spherical area, keeping the anchor on the country's main landmass
 * rather than the whole-feature centroid, which can fall in open ocean.
 */
export function largestPolygonCentroid(feature: Feature): [number, number] {
  const g = feature.geometry;
  if (g.type === "MultiPolygon") {
    let best: Position[][] | null = null;
    let bestArea = -1;
    for (const coords of g.coordinates) {
      const poly: Polygon = { type: "Polygon", coordinates: coords };
      const a = geoArea(poly as never);
      if (a > bestArea) {
        bestArea = a;
        best = coords;
      }
    }
    if (best) {
      const poly: Polygon = { type: "Polygon", coordinates: best };
      return geoCentroid(poly as never) as [number, number];
    }
  }
  return geoCentroid(feature) as [number, number];
}

/** flagcdn PNG — RN's Image can't rasterise the SVG endpoints web uses. */
export function flagPng(c: Country, width: 320 | 640 = 640): string {
  return c.cca2 ? `https://flagcdn.com/w${width}/${c.cca2.toLowerCase()}.png` : "";
}

/**
 * Fetch + join TopoJSON geometry with mledoze country metadata, cache it via
 * the platform's KVStorage, and retain the raw topology (the Continent Builder
 * dissolves the placeable set into one silhouette via topojson.merge, which
 * needs the arcs). A singleton — call load() once the platform has registered
 * storage.
 */
export const DataLayer = {
  topo: null as Topo | null, // raw topology, retained for merge/silhouette
  countries: [] as Country[], // sovereign country objects
  byCcn3: new Map<string, Country>(), // padded ccn3 -> country
  byCca3: new Map<string, Country>(),
  features: [] as Feature[], // GeoJSON features for ALL topo countries
  featureById: new Map<string, Feature>(), // padded ccn3 -> feature

  pad3(n: string | number): string {
    return String(n).padStart(3, "0");
  },

  async load(onStatus?: (msg: string) => void): Promise<{ fromCache: boolean }> {
    // 1) Try cache first.
    const cached = await this._readCache();
    if (cached) {
      onStatus?.("Loaded from cache");
      this._hydrate(cached.topo, cached.meta);
      return { fromCache: true };
    }
    onStatus?.("Fetching map & country data…");
    const [topo, meta] = await Promise.all([
      fetch(TOPO_URL).then((r) => {
        if (!r.ok) throw new Error("topo " + r.status);
        return r.json() as Promise<Topo>;
      }),
      fetch(REST_URL).then((r) => {
        if (!r.ok) throw new Error("rest " + r.status);
        return r.json() as Promise<RawMeta[]>;
      }),
    ]);
    this._hydrate(topo, meta);
    await this._writeCache(topo, meta);
    return { fromCache: false };
  },

  _hydrate(topo: Topo, meta: RawMeta[]): void {
    // Retain the raw topology for the builder's topojson.merge silhouette.
    this.topo = topo;
    const fc = feature(topo as never, topo.objects.countries as never) as unknown as {
      features: Feature[];
    };
    this.features = fc.features;
    // Index features by padded ccn3, resolving id collisions. The world-atlas
    // 50m file has several: id "036" is BOTH Australia and the Ashmore & Cartier
    // reef sliver, and five features (Somaliland, Kosovo, N. Cyprus, Indian
    // Ocean Ter., Siachen Glacier) carry no id at all. A naive last-write-wins
    // Map would hand Australia the sliver as its polygon (bbox ≈ 0), so skip the
    // id-less features and keep the geographically largest feature per id.
    this.featureById = new Map();
    for (const f of this.features) {
      if (f.id == null) continue;
      const key = this.pad3(f.id as string | number);
      const prev = this.featureById.get(key);
      if (!prev || geoArea(f as never) > geoArea(prev as never)) {
        this.featureById.set(key, f);
      }
    }
    // Build sovereign country list.
    const keep: Country[] = [];
    this.byCcn3 = new Map();
    this.byCca3 = new Map();
    for (const m of meta) {
      // Sovereign = UN member (or independent state, as a schema-robust OR),
      // plus the explicitly-included non-UN states.
      const isSov =
        m.unMember === true ||
        m.independent === true ||
        (!!m.cca3 && EXTRA_SOVEREIGN.has(m.cca3));
      if (!isSov) continue;
      const ccn3 = m.ccn3 ? this.pad3(m.ccn3) : null;
      const feat = ccn3 ? this.featureById.get(ccn3) ?? null : null;
      const country: Country = {
        id: ccn3 || m.cca3 || "??",
        ccn3,
        cca2: m.cca2 || null,
        cca3: m.cca3 || null,
        name: m.name?.common || m.cca3 || "Unknown",
        official: m.name?.official || "",
        capital: Array.isArray(m.capital) && m.capital.length ? m.capital[0] : "—",
        region: m.region || "Other",
        subregion: m.subregion || m.region || "Other",
        // flagcdn SVG by cca2 — scales crisply at any zoom.
        flagSvg: m.cca2 ? `https://flagcdn.com/${m.cca2.toLowerCase()}.svg` : "",
        flagEmoji: m.flag || "",
        flagAlt: m.name?.common ? m.name.common + " flag" : "",
        area: m.area || 0,
        latlng: m.latlng || null,
        _borders: m.borders || [], // raw cca3 codes
        neighbours: [], // resolved below
        feature: feat,
        centroid: null,
      };
      keep.push(country);
      if (ccn3) this.byCcn3.set(ccn3, country);
      if (m.cca3) this.byCca3.set(m.cca3, country);
    }
    // Geographic centroids (fallback to latlng) for framing/markers. Anchored on
    // the largest polygon so an archipelago's marker/arrow lands on real land —
    // a multipolygon's overall centroid can sit in open water (Kiribati straddles
    // the dateline; its geoCentroid is mid-Pacific).
    for (const c of keep) {
      if (c.feature) {
        try {
          c.centroid = largestPolygonCentroid(c.feature);
        } catch {
          c.centroid = null;
        }
      }
      if ((!c.centroid || isNaN(c.centroid[0])) && c.latlng) {
        c.centroid = [c.latlng[1], c.latlng[0]];
      }
    }
    // Resolve borders (cca3) into neighbour objects within the kept set.
    for (const c of keep) {
      c.neighbours = (c._borders || [])
        .map((code) => this.byCca3.get(code))
        .filter((x): x is Country => Boolean(x));
    }
    this.countries = keep;
  },

  async _readCache(): Promise<CacheBlob | null> {
    const kv = getKVStorage();
    if (!kv) return null;
    try {
      const raw = JSON.parse((await kv.get(DATA_KEY)) || "null");
      if (raw && raw.topo && raw.meta && Array.isArray(raw.meta)) return raw as CacheBlob;
    } catch {
      /* ignore */
    }
    return null;
  },

  async _writeCache(topo: Topo, meta: RawMeta[]): Promise<void> {
    const kv = getKVStorage();
    if (!kv) return;
    try {
      await kv.set(DATA_KEY, JSON.stringify({ topo, meta, t: Date.now() }));
    } catch {
      /* dataset too big for quota — fine, refetch next time */
    }
  },
};
