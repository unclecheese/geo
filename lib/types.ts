import type { Feature } from "geojson";

/** The five quiz modes plus the builder. */
export type ModeId = "find" | "name" | "capital" | "flag" | "border" | "build";

/** Modes belong to mutually-exclusive groups that route to different screens. */
export type ModeGroup = "map" | "expert" | "build";

export interface Mode {
  id: ModeId;
  label: string;
  group: ModeGroup;
  map: boolean;
  short: string;
}

/** One spaced-repetition record, keyed in state by `"countryId:mode"`. */
export interface LeitnerEntry {
  box: number; // 1..5
  seen: number;
  correct: number;
  lastSeen: number;
}

/**
 * A sovereign country, joined from TopoJSON geometry + mledoze metadata.
 * `neighbours` holds resolved Country objects (land borders only). `feature`
 * is the GeoJSON polygon, or null/undefined for the handful of microstates the
 * 50m dataset omits.
 */
export interface Country {
  id: string; // padded ccn3 (or cca3 fallback) — the leitner/history key
  name: string;
  official?: string;
  cca2?: string | null;
  cca3: string | null;
  ccn3?: string | null;
  region: string;
  subregion?: string;
  capital?: string;
  area?: number;
  latlng?: [number, number] | null;
  centroid?: [number, number] | null; // [lng, lat] geographic
  neighbours: Country[];
  feature?: Feature | null;
  flagSvg?: string;
  flagEmoji?: string;
  flagAlt?: string;
  _borders?: string[]; // raw cca3 codes, resolved into `neighbours`

  // Builder-only caches (populated lazily by the build view).
  _display?: Feature | null;
  _colour?: string;
}

export interface HistoryEntry {
  id: string;
  mode: ModeId;
  correct: boolean;
  ms: number;
  region: string;
  t: number;
}

export interface Settings {
  modes: ModeId[];
  region: string;
  subregion: string;
  session: string;
  roundLen: number;
  timed: boolean;
  sound: boolean;
  heatmap: boolean;
  showNames: boolean;
}

export interface Stats {
  answered: number;
  correct: number;
  bestStreak: number;
  streakHistory: number[];
}

export interface AtlasState {
  version: number;
  settings: Settings;
  leitner: Record<string, LeitnerEntry>;
  history: HistoryEntry[];
  stats: Stats;
}
