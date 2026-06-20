import { MODES } from "./modes";
import type { Country, LeitnerEntry, ModeId } from "./types";

type Rng = () => number;
type Leitner = Record<string, LeitnerEntry>;

interface SelectOpts {
  now?: number;
  rng?: Rng;
  avoidId?: string;
  exclude?: Set<string>;
}

/**
 * Pure decision logic — no DOM, no D3. Leitner spaced repetition, weighted
 * item selection, distractor sets, region filters, answer normalisation and
 * grading. Unit-testable in isolation.
 */
export const Logic = {
  // Leitner: correct -> promote (max 5); wrong -> reset to box 1.
  leitnerUpdate(entry: LeitnerEntry | undefined, correct: boolean, now = Date.now()): LeitnerEntry {
    const e: LeitnerEntry =
      entry && typeof entry.box === "number"
        ? { ...entry }
        : { box: 1, seen: 0, correct: 0, lastSeen: 0 };
    e.seen += 1;
    if (correct) {
      e.correct += 1;
      e.box = Math.min(5, e.box + 1);
    } else {
      e.box = 1;
    }
    e.lastSeen = now;
    return e;
  },

  // Selection weight: heavily favour low-box, never-seen, and long-overdue items.
  itemWeight(entry: LeitnerEntry | undefined, now = Date.now()): number {
    if (!entry || !entry.seen) return 12; // never seen → very likely
    const boxWeight = (6 - entry.box) * (6 - entry.box); // box1=25 … box5=1
    // due-ness: longer since last seen relative to box interval => higher
    const intervalMs = [0, 1, 3, 8, 18, 40][entry.box] * 60 * 1000; // synthetic spacing
    const elapsed = now - (entry.lastSeen || 0);
    const due = intervalMs ? Math.min(3, elapsed / intervalMs) : 1;
    return Math.max(0.4, boxWeight * (0.5 + 0.5 * due));
  },

  // Weighted random pick over a pool of country objects for a given mode.
  // leitner: map of "id:mode" -> entry. Returns a country object.
  selectNextItem(
    pool: Country[],
    leitner: Leitner,
    mode: ModeId,
    opts: SelectOpts = {}
  ): Country | null {
    if (!pool || !pool.length) return null;
    const now = opts.now || Date.now();
    const rng = opts.rng || Math.random;
    const avoidId = opts.avoidId;
    const exclude = opts.exclude; // ids already asked this session
    let list = pool.filter((c) => c.id !== avoidId);
    if (exclude && exclude.size) {
      const fresh = list.filter((c) => !exclude.has(c.id));
      if (fresh.length) list = fresh;
    }
    if (!list.length) list = pool;
    const weights = list.map((c) => Logic.itemWeight(leitner[c.id + ":" + mode], now));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < list.length; i++) {
      r -= weights[i];
      if (r <= 0) return list[i];
    }
    return list[list.length - 1];
  },

  // Region-biased multiple-choice distractors. Returns shuffled options incl. the answer.
  makeChoices(item: Country, pool: Country[], n = 4, opts: { rng?: Rng } = {}): Country[] {
    const rng = opts.rng || Math.random;
    const sameRegion = pool.filter((c) => c.id !== item.id && c.region === item.region);
    const other = pool.filter((c) => c.id !== item.id && c.region !== item.region);
    Logic._shuffle(sameRegion, rng);
    Logic._shuffle(other, rng);
    const picks: Country[] = [];
    const want = n - 1;
    while (picks.length < want && sameRegion.length) picks.push(sameRegion.pop()!);
    while (picks.length < want && other.length) picks.push(other.pop()!);
    const options = picks.concat([item]);
    Logic._shuffle(options, rng);
    return options;
  },

  // Region/subregion filter over the country list.
  filterPool(countries: Country[], region: string, subregion: string): Country[] {
    return countries.filter((c) => {
      if (region && region !== "all" && c.region !== region) return false;
      if (subregion && subregion !== "all" && c.subregion !== subregion) return false;
      return true;
    });
  },

  // Tiny-country threshold from a projected pixel area (bbox area in px²).
  isTiny(pxArea: number, threshold = 60): boolean {
    return pxArea < threshold;
  },

  // A country can be a target in map modes only if it has a polygon to
  // click/highlight/frame. Microstates without one stay answerable in capital/flag.
  hasMapGeometry(country: Country | null | undefined): boolean {
    return !!(country && country.feature);
  },

  // Pool of countries usable as map-mode targets within the active filter.
  mapPool(pool: Country[]): Country[] {
    return pool.filter(Logic.hasMapGeometry);
  },

  // Mastery score 0..1 for an item across a mode set (avg normalised box).
  masteryFor(leitner: Leitner, id: string, modes: ModeId[]): number | null {
    let sum = 0,
      count = 0;
    for (const m of modes) {
      const e = leitner[id + ":" + m];
      if (e && e.seen) {
        sum += (e.box - 1) / 4;
        count++;
      }
    }
    return count ? sum / count : null; // null = untouched
  },

  // Normalise a free-text answer: lowercase, strip accents, turn runs of
  // punctuation into a single space, collapse whitespace. So "Côte d'Ivoire"
  // normalises to "cote d ivoire".
  normalize(s: string | null | undefined): string {
    return (s == null ? "" : String(s))
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  },

  // Typed-answer grader: forgiving on case / accents / punctuation only.
  matchAnswer(typed: string, correct: string): boolean {
    const t = Logic.normalize(typed);
    return t.length > 0 && t === Logic.normalize(correct);
  },

  // Autocomplete suggestions: prefix matches first, then substring matches.
  suggest(typed: string, candidates: string[], n = 6): string[] {
    const q = Logic.normalize(typed);
    if (!q) return [];
    const starts: string[] = [],
      incl: string[] = [];
    for (const c of candidates) {
      const nc = Logic.normalize(c);
      if (nc.startsWith(q)) starts.push(c);
      else if (nc.includes(q)) incl.push(c);
    }
    return starts.concat(incl).slice(0, n);
  },

  // Modes within one session must share a screen group (map vs expert vs build).
  // Coerce a possibly-mixed set down to its dominant group.
  sanitizeModes(modes: ModeId[]): ModeId[] {
    const valid = (Array.isArray(modes) ? modes : []).filter((m) => MODES[m]);
    if (!valid.length) return ["find", "name"];
    const grp = MODES[valid[0]].group;
    const kept = valid.filter((m) => MODES[m].group === grp);
    return kept.length ? kept : ["find", "name"];
  },

  // Milliseconds → "m:ss" (or "h:mm:ss" past an hour) for the session clock.
  fmtDuration(ms: number): string {
    const total = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  },

  _shuffle<T>(arr: T[], rng: Rng = Math.random): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  },
};
