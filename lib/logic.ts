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

  // Smart multiple-choice distractors: rank the pool by closeness to `item`
  // (subregion/region match, geographic proximity, name similarity), sample
  // n-1 from a top tier so choices stay plausible but vary between plays,
  // then return them plus the answer, shuffled. opts.rng makes it deterministic.
  makeChoices(item: Country, pool: Country[], n = 4, opts: { rng?: Rng } = {}): Country[] {
    const rng = opts.rng || Math.random;
    const want = n - 1;
    const itemLatLng = item.latlng || (item.centroid ? [item.centroid[1], item.centroid[0]] : null);

    const candidates = pool.filter((c) => c.id !== item.id);
    const scored = candidates.map((c) => {
      let score = 0;
      if (c.subregion && item.subregion && c.subregion === item.subregion) score += 100;
      else if (c.region === item.region) score += 50;

      const cLatLng = c.latlng || (c.centroid ? [c.centroid[1], c.centroid[0]] : null);
      if (itemLatLng && cLatLng) {
        const km = Logic.haversineKm(itemLatLng as [number, number], cLatLng as [number, number]);
        score += Math.max(0, 40 - km / 500); // nearer => higher, tapering off over ~20,000km
      }

      const dist = Logic.levenshtein(item.name, c.name);
      score += Math.max(0, 10 - dist);

      return { c, score };
    });
    scored.sort((a, b) => b.score - a.score);

    // Sample from the top tier, but weight by rank within it so the closest
    // matches are still favoured — an unweighted shuffle-and-slice can drop
    // the strongest candidates as often as the weakest once the tier holds
    // more than `want` entries.
    const tierSize = Math.min(scored.length, Math.max(want, 2 * want));
    const tier = scored.slice(0, tierSize).map((s) => s.c);
    const remaining = tier.slice();
    const picks: Country[] = [];
    while (picks.length < want && remaining.length) {
      const weights = remaining.map((_, i) => remaining.length - i); // rank-weighted
      const total = weights.reduce((a, b) => a + b, 0);
      let r = rng() * total;
      let idx = remaining.length - 1;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) {
          idx = i;
          break;
        }
      }
      picks.push(remaining.splice(idx, 1)[0]);
    }

    const options = picks.concat([item]);
    Logic._shuffle(options, rng);
    return options;
  },

  // Great-circle distance in km between two [lat, lng] points (haversine).
  haversineKm(aLatLng: [number, number], bLatLng: [number, number]): number {
    const R = 6371;
    const [lat1, lng1] = aLatLng;
    const [lat2, lng2] = bLatLng;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const rLat1 = (lat1 * Math.PI) / 180;
    const rLat2 = (lat2 * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  },

  // Classic Levenshtein edit distance, case-insensitive.
  levenshtein(a: string, b: string): number {
    const s = a.toLowerCase();
    const t = b.toLowerCase();
    const m = s.length,
      n = t.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) {
        cur[j] =
          s[i - 1] === t[j - 1]
            ? prev[j - 1]
            : 1 + Math.min(prev[j - 1], prev[j], cur[j - 1]);
      }
      prev = cur;
    }
    return prev[n];
  },

  // Region/subregion filter over the country list. Multi-select: an empty
  // array means "no filter" (all pass) for that dimension.
  filterPool(countries: Country[], regions: string[], subregions: string[]): Country[] {
    return countries.filter((c) => {
      if (regions.length && !regions.includes(c.region)) return false;
      if (subregions.length && !(c.subregion && subregions.includes(c.subregion))) return false;
      return true;
    });
  },

  // Hangman-style mask: reveal the first `count` alphabetic letters
  // left-to-right, hide the rest as "_", but always show non-letters
  // (spaces, hyphens, apostrophes) literally. Slots joined with a space.
  revealName(name: string, count: number): string {
    let shown = 0;
    const slots: string[] = [];
    for (const ch of name) {
      if (/[a-zA-Z]/.test(ch)) {
        slots.push(shown < count ? ch : "_");
        shown++;
      } else {
        slots.push(ch);
      }
    }
    return slots.join(" ");
  },

  // Number of alphabetic characters in a name, so callers can cap `count`.
  letterCount(name: string): number {
    return (name.match(/[a-zA-Z]/g) || []).length;
  },

  // Pick a wrong (non-correct, not-yet-eliminated) choice id at random, for
  // "eliminate one" style hints. Null once no eligible choice remains.
  nextEliminate(
    choices: Country[],
    correctId: string,
    eliminated: string[],
    rng: Rng = Math.random
  ): string | null {
    const eliminatedSet = new Set(eliminated);
    const eligible = choices.filter((c) => c.id !== correctId && !eliminatedSet.has(c.id));
    if (!eligible.length) return null;
    return eligible[Math.floor(rng() * eligible.length)].id;
  },

  // Tiny-country test. `landFraction` is the country's LARGEST polygon's
  // projected area as a fraction of the whole projected sphere — viewport
  // independent, unlike raw pixels, so the same countries are boxed on a phone
  // and a wide monitor. Below the threshold there's no visible landmass to aim
  // at, so the map frames the country with an outline box. Judged on the biggest
  // polygon (not total land) so scattered archipelagos (Fiji, the Solomons) —
  // many sub-pixel islands, no single visible blob — count as tiny too.
  isTiny(landFraction: number, threshold = 2.3e-5): boolean {
    return landFraction < threshold;
  },

  // Index of the site nearest to (x, y) within `maxDist`, or -1 if none is in
  // range. Returning the single closest site makes the catch zones a Voronoi
  // partition: they tile the plane and never overlap — the "water buffer around
  // each country, no two zones overlapping" that map clicks resolve against.
  nearestWithin(sites: { x: number; y: number }[], x: number, y: number, maxDist: number): number {
    let best = -1;
    let bestD = maxDist;
    for (let i = 0; i < sites.length; i++) {
      const d = Math.hypot(sites[i].x - x, sites[i].y - y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  },

  // Square-box half-sizes that guarantee no two boxes overlap. Each box is
  // capped at half the Chebyshev distance to its nearest neighbouring centre:
  // two axis-aligned squares are disjoint exactly when the Chebyshev distance
  // between their centres is ≥ the sum of their half-sizes, so capping every box
  // this way keeps every pair apart while letting isolated boxes grow to their
  // full desired size. Used to frame tiny countries with a padded outline that
  // is a big, non-overlapping click target.
  boxHalfSizesNoOverlap(centers: { x: number; y: number }[], desired: number[]): number[] {
    const n = centers.length;
    const out: number[] = new Array(n);
    for (let i = 0; i < n; i++) {
      let nearest = Infinity;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const cheb = Math.max(
          Math.abs(centers[i].x - centers[j].x),
          Math.abs(centers[i].y - centers[j].y)
        );
        if (cheb < nearest) nearest = cheb;
      }
      out[i] = Math.min(desired[i], nearest / 2);
    }
    return out;
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
