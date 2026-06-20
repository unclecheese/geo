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
  id: string; // padded ccn3 — the leitner/history key
  name: string;
  cca2?: string;
  cca3: string;
  ccn3?: string;
  region: string;
  subregion?: string;
  capital?: string;
  centroid?: [number, number];
  neighbours: Country[];
  feature?: Feature | null;
  flagSvg?: string;

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
