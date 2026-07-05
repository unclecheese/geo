# Borders (framed picture) quiz — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the map-based Borders module with a static framed-picture quiz in the Quiz family: a target country framed with padding, its land neighbours numbered, identified by matching (easy) or typing (difficult), graded on a single submit.

**Architecture:** A new standalone borders session — its own store (`store/borders-store.ts`, rewritten) and screen (`app/borders/page.tsx`, rewritten) — renders a static SVG (`components/FrameView.tsx`) via d3-geo instead of driving the live `MapView`. Pure selection/geometry helpers live in `lib/logic.ts` with vitest coverage. The menu folds Borders into the Quiz card as an exclusive toggle.

**Tech Stack:** Next.js 15.5 (App Router) · React · TypeScript · zustand · d3 (`geoBounds`, `geoMercator`, `geoPath`) · vitest.

## Global Constraints

- **NZ/British spelling** in all user-facing copy (colour, centre, neighbour, …).
- **d3 stays out of stores** — only `components/FrameView.tsx` imports d3; `store/borders-store.ts` must not.
- **Pure decision logic goes in `lib/logic.ts` with a unit test** (project convention).
- **D3 views and React pages are not unit-tested** — verified via `npm run build` + browser. Their tasks gate on `npx tsc --noEmit`, `npm run build`, and a manual browser checklist instead of a failing unit test.
- Reuse existing CSS-variable theme and class patterns (`.seg`, `.toggle`/`.switch`, `.ac`, reveal card) rather than inventing new ones.
- `Country.centroid` is `[lng, lat]`; `Country.latlng` is `[lat, lng]`. `d3` projections take `[lng, lat]`.
- Leitner/history key for this mode is `"border"` (unchanged), keyed on the target country id.
- Commit after each task.

---

## File Structure

- `lib/logic.ts` — **add** `pickShown` and `expandBounds` (pure, tested).
- `lib/__tests__/logic.test.ts` — **add** tests for the two helpers.
- `store/borders-store.ts` — **rewrite** for the framed flow (no d3, no MapView).
- `store/borders-store.test.ts` — **rewrite** to cover the new grading/assignment logic.
- `components/FrameView.tsx` — **create** the static SVG frame renderer.
- `app/borders/page.tsx` — **rewrite** to render `FrameView` + answer UI + reveal.
- `app/page.tsx` — **modify** menu: drop the Borders card, add exclusive Borders toggle to the Quiz card, adjust routing.
- `lib/map-view.ts` — **remove** the now-dead `frameConstant` and `paintBorders`.
- `app/globals.css` — **add** styles for the frame, number badges, and the easy-mode matching grid.

Task order: logic → store → FrameView → page → menu → cleanup. Store depends on logic; page depends on store + FrameView; cleanup last (after the old store no longer references the map helpers).

---

## Task 1: Pure logic helpers (`pickShown`, `expandBounds`)

**Files:**
- Modify: `lib/logic.ts` (add two methods to the `Logic` object, near `mapPool`)
- Test: `lib/__tests__/logic.test.ts` (append two `describe` blocks)

**Interfaces:**
- Consumes: existing `Logic._shuffle<T>(arr: T[], rng?: () => number): T[]`, the `Rng` type alias already in the file.
- Produces:
  - `Logic.pickShown(neighbours: Country[], max?: number, rng?: () => number): Country[]` — up to `max` (default 6) neighbours; a random subset when there are more.
  - `Logic.expandBounds(bounds: [[number, number], [number, number]], factor?: number): [[number, number], [number, number]]` — lon/lat box grown by `factor` (default 0.5) of its span on each side; latitude clamped to ±90.

- [ ] **Step 1: Write the failing tests**

Append to `lib/__tests__/logic.test.ts` (the file already defines `mk(id, region, opts)` and `seeded(seed)`):

```ts
describe("Logic.pickShown", () => {
  it("returns all neighbours unchanged when at or below the cap", () => {
    const ns = [mk("a", "Europe"), mk("b", "Europe"), mk("c", "Europe")];
    expect(Logic.pickShown(ns, 6)).toHaveLength(3);
    expect(Logic.pickShown(ns, 6).map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("picks exactly `max` when there are more, all drawn from the input", () => {
    const ns = Array.from({ length: 14 }, (_, i) => mk("n" + i, "Asia"));
    const ids = new Set(ns.map((c) => c.id));
    const got = Logic.pickShown(ns, 6, seeded(7));
    expect(got).toHaveLength(6);
    expect(new Set(got.map((c) => c.id)).size).toBe(6); // no duplicates
    for (const c of got) expect(ids.has(c.id)).toBe(true);
  });

  it("does not mutate the input array", () => {
    const ns = Array.from({ length: 10 }, (_, i) => mk("n" + i, "Asia"));
    Logic.pickShown(ns, 6, seeded(1));
    expect(ns).toHaveLength(10);
  });
});

describe("Logic.expandBounds", () => {
  it("grows the box by the factor of its span on each side", () => {
    const out = Logic.expandBounds([[0, 0], [10, 20]], 0.5);
    expect(out).toEqual([[-5, -10], [15, 30]]);
  });

  it("clamps latitude to the poles", () => {
    const out = Logic.expandBounds([[0, -80], [10, 80]], 0.5);
    expect(out[0][1]).toBe(-90);
    expect(out[1][1]).toBe(90);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/__tests__/logic.test.ts -t "pickShown|expandBounds"`
Expected: FAIL — `Logic.pickShown is not a function` / `Logic.expandBounds is not a function`.

- [ ] **Step 3: Implement the helpers**

In `lib/logic.ts`, add these two methods inside the `Logic` object, immediately after `mapPool` (around line 277):

```ts
  // Neighbours to number in a borders question: up to `max`, a random subset when
  // there are more (so large countries vary which six they ask). rng is injectable
  // so the pick is testable.
  pickShown(neighbours: Country[], max = 6, rng: Rng = Math.random): Country[] {
    if (neighbours.length <= max) return neighbours.slice();
    return Logic._shuffle(neighbours.slice(), rng).slice(0, max);
  },

  // Grow a [[west,south],[east,north]] lon/lat box by `factor` of its span on each
  // side, so a country's frame shows a margin of its surroundings. Latitude clamps
  // to the poles; longitude is left unclamped (frames are local).
  expandBounds(
    bounds: [[number, number], [number, number]],
    factor = 0.5
  ): [[number, number], [number, number]] {
    const [[w, s], [e, n]] = bounds;
    const dx = (e - w) * factor;
    const dy = (n - s) * factor;
    return [
      [w - dx, Math.max(-90, s - dy)],
      [e + dx, Math.min(90, n + dy)],
    ];
  },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/__tests__/logic.test.ts -t "pickShown|expandBounds"`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/logic.ts lib/__tests__/logic.test.ts
git commit -m "Borders: add pickShown + expandBounds logic helpers"
```

---

## Task 2: Rewrite the borders store

**Files:**
- Rewrite: `store/borders-store.ts`
- Rewrite: `store/borders-store.test.ts`

**Interfaces:**
- Consumes: `Logic.pickShown`, `Logic.makeChoices`, `Logic.matchAnswer`, `Logic.filterPool`, `Logic.selectNextItem`, `Logic._shuffle`; `DataLayer.countries`; `useAtlasStore` (`settings`, `leitner`, `recordVerdict`, `recordBestStreak`); `QuizSession` from `store/quiz-store`; `Audio2`/`Confetti` from `lib/fx`; `toast`.
- Produces (used by the page in Task 4):
  - State: `active`, `session: QuizSession | null`, `finished`, `target: Country | null`, `shown: Country[]` (badge `i` is `shown[i-1]`), `candidates: Country[]` (easy list; `[]` when difficult), `easy: boolean`, `assign: Record<string, number | null>`, `typed: Record<number, string>`, `answered`, `reveal: BordersReveal | null`, `elapsedMs`.
  - Actions: `start()`, `next()`, `setAssign(candidateId: string, num: number | null)`, `setTyped(num: number, value: string)`, `submit()`, `quit()`.
  - Exported types: `BordersResult` (`{ country: Country; num: number; ok: boolean }`), `BordersReveal` (`{ target: Country; correct: boolean; ms: number; results: BordersResult[] }`).

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `store/borders-store.test.ts` with:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";

// Isolate the store from browser-only deps.
vi.mock("@/store/toast-store", () => ({ toast: vi.fn() }));
vi.mock("@/lib/fx", () => ({
  Audio2: { correct: vi.fn(), wrong: vi.fn(), milestone: vi.fn(), ensure: vi.fn() },
  Confetti: { burst: vi.fn() },
}));

import { useBordersStore } from "@/store/borders-store";
import { useAtlasStore } from "@/store/atlas-store";
import type { Country } from "@/lib/types";
import type { QuizSession } from "@/store/quiz-store";

const mk = (id: string, name: string): Country =>
  ({ id, name, region: "Europe", neighbours: [], feature: {}, centroid: [0, 0] } as unknown as Country);

const FRANCE = mk("250", "France");
const SPAIN = mk("724", "Spain");
const GERMANY = mk("276", "Germany");
const ITALY = mk("380", "Italy");
const PORTUGAL = mk("620", "Portugal"); // distractor: not a neighbour here

const baseSession = (): QuizSession => ({
  type: "round", screen: "quiz", total: 10, timed: false,
  asked: 1, score: 0, streak: 0, bestStreak: 0, correct: 0,
  askedIds: new Set(["250"]), startTime: 0, elapsedMs: 0,
});

// Seed the store mid-question, awaiting answers.
const seed = (over: Partial<ReturnType<typeof useBordersStore.getState>> = {}) =>
  useBordersStore.setState({
    active: true, answered: false, finished: false,
    session: baseSession(), target: FRANCE,
    shown: [SPAIN, GERMANY, ITALY],
    candidates: [], easy: false, assign: {}, typed: {},
    reveal: null, qStartTime: 0, elapsedMs: 0, _timerId: null,
    ...over,
  });

beforeEach(() => {
  useAtlasStore.setState({ leitner: {}, history: [], stats: { answered: 0, correct: 0, bestStreak: 0, streakHistory: [] } });
});

describe("borders submit — difficult (typed)", () => {
  it("marks the question correct only when every blank matches", () => {
    seed({ easy: false, typed: { 1: "spain", 2: "germany", 3: "italy" } });
    useBordersStore.getState().submit();
    const st = useBordersStore.getState();
    expect(st.answered).toBe(true);
    expect(st.reveal!.correct).toBe(true);
    expect(st.reveal!.results.every((r) => r.ok)).toBe(true);
  });

  it("is incorrect (all-or-nothing) when one blank is wrong, with per-blank results", () => {
    seed({ easy: false, typed: { 1: "spain", 2: "germany", 3: "belgium" } });
    useBordersStore.getState().submit();
    const st = useBordersStore.getState();
    expect(st.reveal!.correct).toBe(false);
    expect(st.reveal!.results.map((r) => r.ok)).toEqual([true, true, false]);
  });
});

describe("borders submit — easy (matching)", () => {
  it("is correct when neighbours map to their numbers and distractors are left unassigned", () => {
    seed({
      easy: true,
      candidates: [SPAIN, GERMANY, ITALY, PORTUGAL],
      assign: { "724": 1, "276": 2, "380": 3, "620": null },
    });
    useBordersStore.getState().submit();
    expect(useBordersStore.getState().reveal!.correct).toBe(true);
  });

  it("is incorrect when a distractor is assigned a number", () => {
    seed({
      easy: true,
      candidates: [SPAIN, GERMANY, ITALY, PORTUGAL],
      assign: { "724": 1, "276": 2, "380": 3, "620": 1 },
    });
    useBordersStore.getState().submit();
    expect(useBordersStore.getState().reveal!.correct).toBe(false);
  });
});

describe("borders setAssign", () => {
  it("gives a badge number to at most one candidate (steals it)", () => {
    seed({ easy: true, candidates: [SPAIN, GERMANY], assign: { "724": 1 } });
    useBordersStore.getState().setAssign("276", 1);
    const a = useBordersStore.getState().assign;
    expect(a["724"]).toBeNull();
    expect(a["276"]).toBe(1);
  });
});

describe("borders submit — verdict recorded", () => {
  it("records a single border verdict for the target", () => {
    seed({ easy: false, typed: { 1: "spain", 2: "germany", 3: "italy" } });
    useBordersStore.getState().submit();
    expect(useAtlasStore.getState().leitner["250:border"]).toBeTruthy();
    expect(useAtlasStore.getState().stats.answered).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run store/borders-store.test.ts`
Expected: FAIL — current store has no `shown`/`easy`/`assign`/`typed`/`setAssign`/`submit`; old field names differ.

- [ ] **Step 3: Rewrite the store**

Replace the entire contents of `store/borders-store.ts` with:

```ts
import { create } from "zustand";
import { Logic } from "@/lib/logic";
import { DataLayer } from "@/lib/data-layer";
import { Audio2, Confetti } from "@/lib/fx";
import { useAtlasStore } from "@/store/atlas-store";
import { toast } from "@/store/toast-store";
import type { Country } from "@/lib/types";
import type { QuizSession } from "@/store/quiz-store";

// "Borders" quiz: a target country is shown in a static framed picture with its
// land neighbours numbered around it (see components/FrameView). The player
// identifies each numbered neighbour — matching names to numbers (easy) or typing
// each (difficult) — then submits the whole question at once. No live map, so this
// store holds no d3/MapView; it is a plain state machine over the framed picture.

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const SHOW_MAX = 6;

// A neighbour is numberable only if it has geometry/marker to render.
const drawable = (c: Country): boolean => !!(c.feature || c.centroid);
const neighboursOf = (c: Country): Country[] => c.neighbours.filter(drawable);

const pool = (): Country[] => {
  const s = useAtlasStore.getState().settings;
  return Logic.filterPool(DataLayer.countries, s.regions, s.subregions);
};

// Targets: framable countries in the active pool with ≥1 drawable neighbour.
const targetPool = (): Country[] =>
  pool().filter((c) => c.feature && neighboursOf(c).length > 0);

export interface BordersResult {
  country: Country; // a numbered neighbour
  num: number; // its 1-based badge number
  ok: boolean;
}

export interface BordersReveal {
  target: Country;
  correct: boolean;
  ms: number;
  results: BordersResult[];
}

interface BordersState {
  active: boolean;
  session: QuizSession | null;
  finished: boolean;
  target: Country | null;
  shown: Country[]; // numbered neighbours; shown[i] carries badge number i+1
  candidates: Country[]; // easy: names to match (shown + distractors), shuffled; [] when difficult
  easy: boolean; // difficulty snapshot for this question
  assign: Record<string, number | null>; // easy: candidate.id -> chosen badge number, or null
  typed: Record<number, string>; // difficult: badge number -> typed value
  answered: boolean;
  reveal: BordersReveal | null;
  qStartTime: number;
  elapsedMs: number;
  _timerId: ReturnType<typeof setInterval> | null;

  start: () => void;
  next: () => void;
  setAssign: (candidateId: string, num: number | null) => void;
  setTyped: (num: number, value: string) => void;
  submit: () => void;
  quit: () => void;
}

export const useBordersStore = create<BordersState>((set, get) => ({
  active: false,
  session: null,
  finished: false,
  target: null,
  shown: [],
  candidates: [],
  easy: true,
  assign: {},
  typed: {},
  answered: false,
  reveal: null,
  qStartTime: 0,
  elapsedMs: 0,
  _timerId: null,

  start: () => {
    const s = useAtlasStore.getState().settings;
    const targets = targetPool();
    if (!targets.length) {
      toast("No countries with land borders in this selection — pick a broader region.", "bad");
      return;
    }
    const t = get()._timerId;
    if (t) clearInterval(t);

    const session: QuizSession = {
      type: s.session,
      screen: "quiz",
      total: s.session === "round" ? s.roundLen : targets.length,
      timed: s.timed,
      asked: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      correct: 0,
      askedIds: new Set<string>(),
      startTime: now(),
      elapsedMs: 0,
    };
    set({
      active: true,
      finished: false,
      session,
      target: null,
      shown: [],
      candidates: [],
      assign: {},
      typed: {},
      answered: false,
      reveal: null,
      elapsedMs: 0,
    });

    const tick = () => {
      const st = get().session;
      if (!st) return;
      st.elapsedMs = now() - st.startTime;
      set({ elapsedMs: st.elapsedMs });
    };
    tick();
    set({ _timerId: setInterval(tick, 500) });

    get().next();
  },

  next: () => {
    const state = get();
    if (!state.active || !state.session) return;
    const session = state.session;

    if (session.asked >= session.total) {
      const t = state._timerId;
      if (t) clearInterval(t);
      session.elapsedMs = session.startTime ? now() - session.startTime : session.elapsedMs;
      Confetti.burst();
      set({ active: false, finished: true, session: { ...session }, target: null, reveal: null, _timerId: null });
      return;
    }

    const leit = useAtlasStore.getState().leitner;
    const picked = Logic.selectNextItem(targetPool(), leit, "border", {
      avoidId: state.target?.id,
      exclude: session.askedIds,
    });
    if (!picked) {
      set({ session: { ...session, total: session.asked } });
      get().next();
      return;
    }

    session.askedIds.add(picked.id);
    session.asked += 1;

    const shown = Logic.pickShown(neighboursOf(picked), SHOW_MAX);
    const easy = useAtlasStore.getState().settings.quizDifficulty === "easy";

    // Easy mode: pad the candidate list up to SHOW_MAX with nearby non-neighbour
    // distractors (makeChoices ranks by proximity/region), then shuffle. When the
    // shown neighbours already fill the list there are no distractors.
    let candidates: Country[] = [];
    if (easy) {
      const excluded = new Set([picked.id, ...picked.neighbours.map((n) => n.id)]);
      const base = DataLayer.countries.filter((c) => !excluded.has(c.id));
      const want = Math.max(0, SHOW_MAX - shown.length);
      const distractors = want
        ? Logic.makeChoices(picked, base, want + 1)
            .filter((c) => c.id !== picked.id)
            .slice(0, want)
        : [];
      candidates = Logic._shuffle(shown.concat(distractors));
    }

    set({
      target: picked,
      shown,
      candidates,
      easy,
      assign: {},
      typed: {},
      answered: false,
      reveal: null,
      qStartTime: now(),
      session: { ...session },
    });
  },

  setAssign: (candidateId, num) => {
    const state = get();
    if (!state.active || state.answered) return;
    // A badge number holds one candidate at a time — clear any prior holder.
    const assign: Record<string, number | null> = { ...state.assign };
    if (num !== null) {
      for (const id of Object.keys(assign)) if (assign[id] === num) assign[id] = null;
    }
    assign[candidateId] = num;
    set({ assign });
  },

  setTyped: (num, value) => {
    const state = get();
    if (!state.active || state.answered) return;
    set({ typed: { ...state.typed, [num]: value } });
  },

  submit: () => {
    const state = get();
    const { target, shown, session } = state;
    if (!state.active || state.answered || !target || !session) return;

    const results: BordersResult[] = shown.map((c, i) => {
      const num = i + 1;
      const ok = state.easy
        ? state.assign[c.id] === num
        : Logic.matchAnswer(state.typed[num] || "", c.name);
      return { country: c, num, ok };
    });
    // Easy mode also requires every distractor to be left unassigned.
    const distractorsClean = state.easy
      ? state.candidates.every((c) => shown.some((s) => s.id === c.id) || state.assign[c.id] == null)
      : true;
    const correct = results.every((r) => r.ok) && distractorsClean;

    const ms = Math.round(now() - state.qStartTime);
    const s = { ...session };
    if (correct) {
      s.correct += 1;
      s.streak += 1;
      s.score += 100 + Math.min(60, s.streak * 6);
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      Audio2.correct();
      if (s.streak > 0 && s.streak % 5 === 0) {
        Confetti.burst();
        Audio2.milestone();
        toast("🔥 " + s.streak + " in a row!", "good");
      } else {
        toast(`All ${shown.length} neighbours of ${target.name}!`, "good");
      }
    } else {
      s.streak = 0;
      Audio2.wrong();
      const got = results.filter((r) => r.ok).length;
      toast(`${got} / ${shown.length} — that's ${target.name}.`, "bad");
    }

    const atlas = useAtlasStore.getState();
    atlas.recordVerdict({ id: target.id, mode: "border", correct, ms, region: target.region, streak: s.streak });
    atlas.recordBestStreak(s.bestStreak);

    set({
      answered: true,
      session: s,
      reveal: { target, correct, ms, results },
    });
  },

  quit: () => {
    const t = get()._timerId;
    if (t) clearInterval(t);
    set({
      active: false,
      finished: false,
      session: null,
      target: null,
      shown: [],
      candidates: [],
      assign: {},
      typed: {},
      answered: false,
      reveal: null,
      _timerId: null,
    });
  },
}));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run store/borders-store.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors from `store/borders-store.ts` or its test. (The old `app/borders/page.tsx` still references removed fields — it is rewritten in Task 4. If typecheck flags only `app/borders/page.tsx`, that is expected and fixed there. If you want a clean gate now, run `npx tsc --noEmit 2>&1 | grep -v "app/borders/page.tsx"` and expect no output.)

- [ ] **Step 6: Commit**

```bash
git add store/borders-store.ts store/borders-store.test.ts
git commit -m "Borders: rewrite store for framed-picture quiz (matching + typing, submit-once)"
```

---

## Task 3: FrameView component + styles

**Files:**
- Create: `components/FrameView.tsx`
- Modify: `app/globals.css` (append a Borders/FrameView block)

**Interfaces:**
- Consumes: `DataLayer.countries` (each with `.feature`, `.centroid`), `Logic.expandBounds`, d3 `geoBounds`/`geoMercator`/`geoPath`, `Country`.
- Produces: `FrameView({ target: Country; shown: Country[]; width?: number; height?: number }): JSX.Element` — a static SVG; badge `i+1` sits on `shown[i]`.

Not unit-tested (D3/DOM). Gate: `npx tsc --noEmit` + `npm run build` + browser check in Task 4.

- [ ] **Step 1: Create the component**

Create `components/FrameView.tsx`:

```tsx
"use client";

import { useMemo } from "react";
import { geoBounds, geoMercator, geoPath } from "d3";
import type { Feature } from "geojson";
import { Logic } from "@/lib/logic";
import { DataLayer } from "@/lib/data-layer";
import type { Country } from "@/lib/types";

interface FrameViewProps {
  target: Country;
  shown: Country[]; // numbered neighbours; shown[i] -> badge i+1
  width?: number;
  height?: number;
}

// A static, non-interactive picture of one country framed with padding so its
// neighbours are partially visible. Numbered badges mark the neighbours the quiz
// asks about; the target is filled and labelled. Water is just the SVG background.
// Rendered fresh per question — cheap enough to draw every country and clip.
export function FrameView({ target, shown, width = 640, height = 440 }: FrameViewProps) {
  const { paths, badges, label } = useMemo(() => {
    const empty = { paths: [] as { id: string; d: string; cls: string }[], badges: [] as { num: number; x: number; y: number }[], label: null as null | { name: string; x: number; y: number } };
    if (!target.feature) return empty;

    const raw = geoBounds(target.feature as Feature) as [[number, number], [number, number]];
    const [[w, s], [e, n]] = Logic.expandBounds(raw, 0.6);
    const frame: Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
    };
    const pad = 8;
    const proj = geoMercator().fitExtent([[pad, pad], [width - pad, height - pad]], frame);
    const path = geoPath(proj);

    const shownIds = new Map(shown.map((c, i) => [c.id, i + 1]));
    const paths = DataLayer.countries
      .filter((c) => c.feature)
      .map((c) => {
        const d = path(c.feature as Feature) || "";
        const cls = c.id === target.id ? "fv-target" : shownIds.has(c.id) ? "fv-neighbour" : "fv-land";
        return { id: c.id, d, cls };
      })
      .filter((p) => p.d);

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const badges = shown
      .map((c, i) => {
        const pt = c.centroid ? proj(c.centroid) : null;
        if (!pt) return null;
        return { num: i + 1, x: clamp(pt[0], pad + 14, width - pad - 14), y: clamp(pt[1], pad + 14, height - pad - 14) };
      })
      .filter(Boolean) as { num: number; x: number; y: number }[];

    const tp = target.centroid ? proj(target.centroid) : null;
    const label = tp ? { name: target.name, x: clamp(tp[0], pad, width - pad), y: clamp(tp[1], pad, height - pad) } : null;

    return { paths, badges, label };
  }, [target, shown, width, height]);

  return (
    <svg className="frame-view" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`The area around ${target.name}`}>
      <defs>
        <clipPath id="fv-clip">
          <rect x="0" y="0" width={width} height={height} rx="10" />
        </clipPath>
      </defs>
      <g clipPath="url(#fv-clip)">
        <rect className="fv-water" x="0" y="0" width={width} height={height} />
        {paths.map((p) => (
          <path key={p.id} className={p.cls} d={p.d} />
        ))}
        {label && (
          <text className="fv-label" x={label.x} y={label.y} textAnchor="middle">
            {label.name}
          </text>
        )}
        {badges.map((b) => (
          <g key={b.num} className="fv-badge" transform={`translate(${b.x},${b.y})`}>
            <circle r="13" />
            <text textAnchor="middle" dy="4.5">
              {b.num}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
```

- [ ] **Step 2: Append styles**

Append to `app/globals.css` (uses existing theme variables — verify the names against the top of the file; `--surface`, `--ink`, `--brass`, `--forest`, `--navy`/`--bg` may differ. Match whatever the file already defines for parchment/navy/brass):

```css
/* ---- Borders (framed picture) quiz ---- */
.frame-view {
  width: 100%;
  max-width: 640px;
  height: auto;
  display: block;
  margin: 0 auto 14px;
  border: 1px solid var(--line, rgba(0, 0, 0, 0.2));
  border-radius: 10px;
  background: var(--navy, #16263b);
}
.frame-view .fv-water { fill: var(--navy, #16263b); }
.frame-view .fv-land { fill: rgba(210, 200, 175, 0.28); stroke: rgba(0, 0, 0, 0.25); stroke-width: 0.5; }
.frame-view .fv-neighbour { fill: var(--surface, #e9e0c9); stroke: rgba(0, 0, 0, 0.4); stroke-width: 0.6; }
.frame-view .fv-target { fill: var(--brass, #b7853f); stroke: rgba(0, 0, 0, 0.5); stroke-width: 0.8; }
.frame-view .fv-label {
  fill: #fff; font-family: var(--serif, Georgia, serif); font-weight: 700;
  font-size: 15px; paint-order: stroke; stroke: rgba(0, 0, 0, 0.55); stroke-width: 3px;
}
.frame-view .fv-badge circle { fill: var(--forest, #2f5d4a); stroke: #fff; stroke-width: 2; }
.frame-view .fv-badge text { fill: #fff; font-weight: 700; font-size: 14px; }

/* Easy-mode matching grid: one row per candidate name + number pickers. */
.bd-match { display: flex; flex-direction: column; gap: 8px; max-width: 640px; margin: 0 auto; }
.bd-row { display: flex; align-items: center; gap: 10px; }
.bd-row .bd-cand { flex: 1; font-weight: 600; }
.bd-nums { display: flex; gap: 6px; flex-wrap: wrap; }
.bd-nums button {
  min-width: 34px; height: 34px; border-radius: 8px; border: 1px solid var(--line, rgba(0,0,0,0.25));
  background: var(--surface, #e9e0c9); cursor: pointer; font-weight: 700;
}
.bd-nums button.on { background: var(--forest, #2f5d4a); color: #fff; border-color: var(--forest, #2f5d4a); }

/* Difficult-mode typed rows. */
.bd-blanks { display: flex; flex-direction: column; gap: 10px; max-width: 480px; margin: 0 auto; }
.bd-blank { display: flex; align-items: center; gap: 10px; }
.bd-blank .bd-num {
  width: 30px; height: 30px; flex: none; display: grid; place-items: center;
  border-radius: 50%; background: var(--forest, #2f5d4a); color: #fff; font-weight: 700;
}
.bd-blank input {
  flex: 1; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line, rgba(0,0,0,0.25));
  background: var(--surface, #fff);
}
.bd-submit { margin: 14px auto 0; display: block; }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors from `components/FrameView.tsx`. (Pre-existing `app/borders/page.tsx` errors are fixed in Task 4.)

- [ ] **Step 4: Commit**

```bash
git add components/FrameView.tsx app/globals.css
git commit -m "Borders: add static FrameView renderer + styles"
```

---

## Task 4: Rewrite the borders page

**Files:**
- Rewrite: `app/borders/page.tsx`

**Interfaces:**
- Consumes: `useBordersStore` (Task 2), `FrameView` (Task 3), `useAtlasStore`, `Autocomplete`, `Scorebar`, `Results`, `StatsDashboard`, `useData`, `MODES`, `Logic`, `DataLayer`, `Audio2`.
- Produces: the `/borders` screen. No `MapViewComponent`, no `usePinchGuard`.

Gate: `npx tsc --noEmit` + `npm run build` + browser checklist (Step 4).

- [ ] **Step 1: Rewrite the page**

Replace the entire contents of `app/borders/page.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MODES } from "@/lib/modes";
import { Logic } from "@/lib/logic";
import { DataLayer } from "@/lib/data-layer";
import { useAtlasStore } from "@/store/atlas-store";
import { useBordersStore } from "@/store/borders-store";
import { useData } from "@/components/DataProvider";
import { FrameView } from "@/components/FrameView";
import { Autocomplete } from "@/components/Autocomplete";
import { Scorebar } from "@/components/Scorebar";
import { Results } from "@/components/Results";
import { StatsDashboard } from "@/components/StatsDashboard";
import { Audio2 } from "@/lib/fx";

export default function BordersPage() {
  const router = useRouter();
  const { ready } = useData();

  const session = useBordersStore((s) => s.session);
  const target = useBordersStore((s) => s.target);
  const shown = useBordersStore((s) => s.shown);
  const candidates = useBordersStore((s) => s.candidates);
  const easy = useBordersStore((s) => s.easy);
  const assign = useBordersStore((s) => s.assign);
  const typed = useBordersStore((s) => s.typed);
  const answered = useBordersStore((s) => s.answered);
  const reveal = useBordersStore((s) => s.reveal);
  const finished = useBordersStore((s) => s.finished);

  const start = useBordersStore((s) => s.start);
  const next = useBordersStore((s) => s.next);
  const setAssign = useBordersStore((s) => s.setAssign);
  const setTyped = useBordersStore((s) => s.setTyped);
  const submit = useBordersStore((s) => s.submit);
  const quit = useBordersStore((s) => s.quit);

  const settings = useAtlasStore((s) => s.settings);
  const setSettings = useAtlasStore((s) => s.setSettings);

  const [showStats, setShowStats] = useState(false);

  // Start on mount once data is ready; redirect out if the saved mode isn't Borders.
  useEffect(() => {
    if (!ready) return;
    const modes = Logic.sanitizeModes(useAtlasStore.getState().settings.modes);
    if (MODES[modes[0]]?.group !== "borders") {
      router.replace("/");
      return;
    }
    const st = useBordersStore.getState();
    if (!st.active && !st.finished) start();
    return () => useBordersStore.getState().quit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Enter advances once the reveal card is showing (but not while typing a blank).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches?.("input")) return;
      if (e.key === "Enter" && answered && reveal) next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answered, reveal, next]);

  if (!ready) return null;

  const backToMenu = () => {
    quit();
    router.push("/", { scroll: false });
  };

  const toggleSound = () => {
    const on = !settings.sound;
    setSettings({ sound: on });
    if (on) {
      Audio2.ensure();
      Audio2.correct();
    }
  };

  const progressText = session ? `${session.asked} / ${session.total}` : "";
  const nums = shown.map((_, i) => i + 1); // badge numbers 1..n

  return (
    <section className="screen-quiz">
      <div className="screen-top">
        <div className="st-left">
          <button className="icon-btn" title="Back to menu" onClick={backToMenu}>
            ←
          </button>
          <div className="brand sm">
            <div className="logo" />
            <h1>GeoBean</h1>
          </div>
        </div>
        <div className="st-right">
          <button
            className={"icon-btn sound-btn" + (settings.sound ? " active" : "")}
            title={"Sound (" + (settings.sound ? "on" : "off") + ")"}
            onClick={toggleSound}
          >
            {settings.sound ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      <div className="quiz-stage">
        <div className="q-top">
          <span className="q-mode">Borders</span>
          <span className="q-progress">{progressText}</span>
        </div>

        {target && (
          <>
            <div className="q-prompt" style={{ textAlign: "center" }}>
              Name the countries bordering <span className="em">{target.name}</span>
            </div>
            <div className="q-sub" style={{ textAlign: "center" }}>
              {easy
                ? "Tap each name, then its number in the picture. Some don't border it — leave those unset."
                : "Type the country at each number"}
            </div>

            <FrameView key={target.id} target={target} shown={shown} />

            {/* Easy: match candidate names to badge numbers. */}
            {easy && !answered && (
              <div className="bd-match">
                {candidates.map((c) => (
                  <div className="bd-row" key={c.id}>
                    <span className="bd-cand">{c.name}</span>
                    <div className="bd-nums">
                      {nums.map((num) => (
                        <button
                          key={num}
                          className={assign[c.id] === num ? "on" : ""}
                          onClick={() => setAssign(c.id, assign[c.id] === num ? null : num)}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <button className="btn bd-submit" onClick={submit}>
                  Submit ▸
                </button>
              </div>
            )}

            {/* Difficult: one autocomplete per badge number. */}
            {!easy && !answered && (
              <div className="bd-blanks">
                {nums.map((num) => (
                  <div className="bd-blank" key={num}>
                    <span className="bd-num">{num}</span>
                    <BlankInput
                      value={typed[num] || ""}
                      candidates={allNames}
                      onChange={(v) => setTyped(num, v)}
                    />
                  </div>
                ))}
                <button className="btn bd-submit" onClick={submit}>
                  Submit ▸
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Scorebar />

      {/* Reveal: per-neighbour ✓/✗ with the correct names. */}
      {answered && reveal && (
        <div id="reveal" className={"show " + (reveal.correct ? "good" : "bad")}>
          <div className="rv-head">
            <img className="rv-flag" src={reveal.target.flagSvg} alt="" />
            <div>
              <div className="rv-name">{reveal.target.name}</div>
              <div className="rv-cap">
                {reveal.results.filter((r) => r.ok).length} of {reveal.results.length} correct
              </div>
            </div>
            <div className={"rv-verdict " + (reveal.correct ? "good" : "bad")}>
              {reveal.correct ? "✓ All correct" : `${reveal.results.filter((r) => r.ok).length} / ${reveal.results.length}`}
            </div>
          </div>
          <div className="rv-meta">
            {reveal.results.map((r) => (
              <span key={r.country.id} className={r.ok ? "bd-ok" : "bd-no"}>
                {r.ok ? "✓ " : "✗ "}
                {r.num}. {r.country.name}
              </span>
            ))}
          </div>
          <button className="btn rv-next" onClick={next}>
            Next ▸
          </button>
        </div>
      )}

      <Results
        session={finished ? session : null}
        onAgain={start}
        onStats={() => setShowStats(true)}
        onMenu={backToMenu}
      />
      <StatsDashboard open={showStats} onClose={() => setShowStats(false)} />
    </section>
  );

  // Naming candidates: any country, since neighbours can sit outside the filter.
  function get_allNames() {
    return [...new Set(DataLayer.countries.map((c) => c.name))];
  }
}

const allNames = [...new Set([])] as string[]; // replaced below at module init

// A controlled autocomplete wrapper: the shared Autocomplete submits a value; here
// we mirror it into store state as the player types/selects, and never auto-advance.
function BlankInput({
  value,
  candidates,
  onChange,
}: {
  value: string;
  candidates: string[];
  onChange: (v: string) => void;
}) {
  return <Autocomplete candidates={candidates} onSubmit={(v) => onChange(v)} />;
}
```

> **Note on `allNames`:** the block above sketches the wiring but must be cleaned up in Step 2 — the shared `Autocomplete` component fires `onSubmit` (Enter/click/Submit), not per-keystroke `onChange`, and it renders its own Skip/Submit buttons which we do not want per blank. Step 2 replaces `BlankInput` with a purpose-built input so difficult mode behaves correctly.

- [ ] **Step 2: Fix difficult-mode input (purpose-built, no per-blank Submit/Skip)**

The shared `Autocomplete` renders its own Skip/Submit and only reports on submit — wrong for multi-blank. Replace the `allNames`/`get_allNames`/`BlankInput` scaffolding with a proper controlled input. Make these edits to `app/borders/page.tsx`:

1. Add near the other in-component derived values (after `const nums = ...`):

```tsx
  // Naming candidates for difficult mode: any country (neighbours may sit outside
  // the active region filter).
  const allNames = [...new Set(DataLayer.countries.map((c) => c.name))];
```

2. Delete the stray module-level `const allNames = ...` line and the `get_allNames` method.

3. Replace the `BlankInput` component with a controlled suggestion input:

```tsx
// A controlled name input with a lightweight suggestion dropdown, mirrored straight
// into store state (no per-blank Submit/Skip — one Submit grades the whole picture).
function BlankInput({
  value,
  candidates,
  onChange,
}: {
  value: string;
  candidates: string[];
  onChange: (v: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const items = focused ? Logic.suggest(value, candidates, 6) : [];
  return (
    <div className="ac" style={{ flex: 1 }}>
      <input
        className="ac-input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="Type a country…"
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="ac-list" hidden={!items.length}>
        {items.map((c) => (
          <div
            key={c}
            className="ac-opt"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange(c);
              setFocused(false);
            }}
          >
            {c}
          </div>
        ))}
      </div>
    </div>
  );
}
```

4. Remove the now-unused `Autocomplete` import if nothing else in the file uses it (difficult mode now uses `BlankInput`; easy mode uses the matching grid — so `Autocomplete` is no longer used here). Confirm with `grep -n "Autocomplete" app/borders/page.tsx` and drop the import line if the only hit is the (now-deleted) usage.

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: build succeeds (Compiled successfully).

- [ ] **Step 4: Browser verification**

Run one server only (see CLAUDE.md — kill strays first): `npm run start` after the build, open `http://localhost:3000`.

Checklist (drive with chrome-devtools MCP or by hand):
- From the menu, open **Quiz**, switch on **Borders** (Task 5 wires this; if Task 5 isn't done yet, temporarily set `modes:["border"]` via the console: `localStorage` state or the store) and Start.
- Easy difficulty: a framed picture shows the target filled/labelled with numbered neighbours; a candidate list appears with number pickers; assigning a number to one name clears it from any other; Submit grades once; reveal shows per-number ✓/✗; **Next** advances.
- Difficult difficulty: one input per number with a suggestion dropdown; no per-blank Submit/Skip; one Submit grades all; reveal correct.
- A big country (e.g. China/Russia) shows at most 6 numbered neighbours; a 1–2 neighbour country (e.g. Portugal, Denmark) shows the neighbour(s) plus distractors in easy mode, totalling up to six candidates.
- No console errors; the picture is centred with visible surrounding countries and water as background.

- [ ] **Step 5: Commit**

```bash
git add app/borders/page.tsx
git commit -m "Borders: rewrite page — framed picture, matching (easy) / typed (difficult), submit-once"
```

---

## Task 5: Menu integration (Quiz card gains an exclusive Borders toggle)

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: existing menu machinery (`CARDS`, `openCard`, `toggleMode`, `start`, `MODES`, `settings`).
- Produces: Borders selectable inside the Quiz card; Borders mutually exclusive with capital/flag; routing to `/borders`.

Gate: `npx tsc --noEmit` + `npm run build` + browser check.

- [ ] **Step 1: Remove the standalone Borders card**

In `app/page.tsx`, delete the borders entry from `CARDS` (around line 22):

```tsx
  { type: "borders", icon: "🧭", title: "Borders", tag: "Name the neighbours", blurb: "Zoom in on a country and name every one that borders it." },
```

Update the Quiz card blurb to mention borders (line 21):

```tsx
  { type: "expert", icon: "🚩", title: "Quiz", tag: "Flags · capitals · borders", blurb: "Rapid-fire flags, capitals, and framed borders. No world map — just recall." },
```

- [ ] **Step 2: Let the Quiz group include `border`, exclusively**

`QUIZ_MODES` currently lists the freely-combinable expert modes. Borders is exclusive, so keep it separate. Change the `QUIZ_MODES` constant (line 27) to keep capital/flag, and add a dedicated exclusivity rule in `toggleMode`.

Replace `toggleMode` (lines 99–105) with:

```tsx
  // Toggle a mode within the Quiz card. Capitals + Flags combine freely and
  // interleave; Borders is a standalone quiz, so selecting it clears the others
  // (and selecting either of them clears Borders).
  const toggleMode = (id: ModeId) => {
    if (id === "border") {
      const on = settings.modes.includes("border");
      setSettings({ modes: on ? ["capital"] : ["border"] });
      return;
    }
    const group = MODES[id].group;
    const set = new Set(
      settings.modes.filter((m) => MODES[m]?.group === group && m !== "border")
    );
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setSettings({ modes: [...set] });
  };
```

> Note: `border`'s group is `"borders"`, not `"expert"`, so it never mixes with capital/flag through the group filter — the explicit branch above is what makes toggling it exclusive. Turning off Borders falls back to `["capital"]` so the card is never left empty.

- [ ] **Step 3: When opening the Quiz card, keep a borders selection intact**

In `openCard` (the `type === "expert"` branch, lines 77–79), preserve an existing borders choice instead of forcing capital/flag:

```tsx
    } else if (type === "expert") {
      // Quiz card hosts capital/flag (combinable) and border (exclusive). Keep a
      // saved border selection; otherwise keep any capital/flag, defaulting to both.
      if (settings.modes.includes("border")) {
        patch.modes = ["border"];
      } else {
        const keep = settings.modes.filter((m) => QUIZ_MODES.includes(m));
        patch.modes = keep.length ? keep : ["capital", "flag"];
      }
    }
```

- [ ] **Step 4: Add the Borders toggle to the Quiz card UI**

In the `selected === "expert"` section (the "What to test" block, lines 387–406), add a third toggle after the Capitals toggle, inside the same `<div className="section">`:

```tsx
              <label className="toggle">
                <div>🧭 Borders <small>Name the neighbours in a framed picture (its own quiz)</small></div>
                <span className="switch">
                  <input type="checkbox" checked={modeOn("border")} onChange={() => toggleMode("border")} />
                  <span />
                </span>
              </label>
```

- [ ] **Step 5: Route Borders to `/borders`**

`start()` already routes `grp === "borders"` to `/borders` (line 147) — since `MODES.border.group === "borders"`, no change needed there. Verify by reading `start()`.

But the **difficulty block** (`DifficultyBlock`) is only rendered for `selected === "map" || selected === "expert"` (line 410) — good, so the Quiz card still shows Easy/Difficult, which borders now uses. No change.

The **`noModes`** guard (lines 192–195) checks `selected === "map" || selected === "expert"` and requires a mode in that `selected` group. When Borders is on, `settings.modes = ["border"]` whose group is `"borders"`, so `noModes` would be `true` (no expert-group mode) and disable Start incorrectly. Fix `noModes`:

```tsx
  // Map/Quiz require at least one mode switched on. In the Quiz card, Borders (its
  // own group) also counts as a valid selection.
  const noModes =
    hydrated &&
    (selected === "map" || selected === "expert") &&
    !settings.modes.some(
      (m) => MODES[m]?.group === selected || (selected === "expert" && m === "border")
    );
```

- [ ] **Step 6: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: Compiled successfully.

- [ ] **Step 7: Browser verification**

`npm run start`, open `http://localhost:3000`:
- Only three landing cards now (Map, Quiz, Puzzle) — no separate Borders card.
- Open **Quiz**: three toggles (Flags, Capitals, Borders). Turning on Borders switches off Capitals/Flags; turning on Capitals switches off Borders. Start is enabled with only Borders on.
- Start with Borders → lands on the framed borders screen and plays. Start with Capitals+Flags → `/quiz` as before, no borders.
- Difficulty Easy/Difficult toggles the borders answer style (matching vs typing).

- [ ] **Step 8: Commit**

```bash
git add app/page.tsx
git commit -m "Menu: fold Borders into the Quiz card as an exclusive toggle; drop the Borders card"
```

---

## Task 6: Remove the dead map helpers

**Files:**
- Modify: `lib/map-view.ts` (delete `frameConstant` and `paintBorders`)

**Interfaces:**
- Consumes: nothing new.
- Produces: a smaller `MapView`. `frameCountry` stays (quiz-store `name` mode uses it).

- [ ] **Step 1: Confirm the helpers are now unreferenced**

Run: `grep -rn "frameConstant\|paintBorders" lib store app components`
Expected: matches **only** in `lib/map-view.ts` (their definitions). If any other file references them, stop — a prior task left a reference; fix that first.

- [ ] **Step 2: Delete the two methods**

In `lib/map-view.ts`, remove the entire `frameConstant(...)` method (starts ~line 499) and the entire `paintBorders(...)` method (starts ~line 530), including their doc comments. Leave `frameCountry` (ends just before `frameConstant`) intact.

- [ ] **Step 3: Typecheck and build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run build`
Expected: Compiled successfully.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: all tests pass (logic + store suites green).

- [ ] **Step 5: Commit**

```bash
git add lib/map-view.ts
git commit -m "Map: drop frameConstant/paintBorders (only used by the old map-based borders)"
```

---

## Self-Review

**Spec coverage:**
- Delete old map-based borders → Task 2 (store rewrite, no MapView), Task 5 (drop card), Task 6 (drop map helpers). ✅
- Framed static picture, Mercator per country, target labelled, numbered neighbours, water as background → Task 3 (`FrameView`). ✅
- Cap at 6, randomly chosen → Task 1 (`pickShown`) + Task 2 (`next()`). ✅
- Easy = matching (six candidates incl. distractors, "not shown"), Difficult = typed per number → Task 2 (state/grading) + Task 4 (UI). ✅
- Fill-all, submit-once; per-item ✓/✗ reveal; all-or-nothing Leitner verdict on `border` → Task 2 (`submit`) + Task 4 (reveal). ✅
- Standalone (no interleave); exclusive in Quiz card; routing → Task 5. ✅
- Pure logic in `lib/logic.ts` with tests; d3 out of the store; views verified in browser → Tasks 1–6 respect this. ✅
- Water parked → not implemented; `FrameView` renders water as background, ready to extend. ✅

**Placeholder scan:** Task 4 deliberately shows a first-pass page (Step 1) then corrects the difficult-mode input (Step 2) — this is a real two-step refactor with full code in both, not a placeholder. No TBD/TODO/"handle edge cases" left.

**Type consistency:** `shown: Country[]`, `candidates: Country[]`, `assign: Record<string, number | null>`, `typed: Record<number, string>`, `BordersResult`, `BordersReveal`, and actions `setAssign`/`setTyped`/`submit` are defined identically in Task 2 and consumed identically in Task 4. `Logic.pickShown`/`Logic.expandBounds` signatures match between Task 1 (definition) and Tasks 2/3 (use). `FrameView` props (`target`, `shown`, `width?`, `height?`) match between Task 3 and Task 4.

---

## Deferred (not in this plan)
- **Water borders** (salt/fresh + named bodies). Needs a curated country→water dataset; `FrameView` already renders water so it can be layered on later.
- **Interleaving** borders with capitals/flags in one session.
