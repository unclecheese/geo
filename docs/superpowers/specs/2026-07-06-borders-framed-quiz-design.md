# Borders (framed picture) quiz — design

**Date:** 2026-07-06
**Status:** Approved, ready for implementation plan

## Summary

Replace the current map-based Borders family with a new **framed-picture** borders
quiz that lives inside the **Quiz** module alongside Capitals and Flags. Instead of
clicking slivers on the live world map, the player sees a static "picture frame":
the target country centred, its outline labelled, with enough padding that the
surrounding countries are partially visible. Each land neighbour carries a **number
badge**; the player identifies the numbered neighbours — by matching (easy) or by
typing (difficult) — then submits the whole question at once.

Water borders are **parked for v1** (they need curated data the dataset lacks). The
static frame renders water as empty background, which sets the feature up cleanly for
later.

## Motivation

The existing Borders module is map-driven (frame the target on the interactive world
map, click each neighbour sliver, name it). We want a recall-style exercise that fits
the "Quiz" family (no map, just a picture and answers), reads like a labelled diagram,
and is quicker to run through.

## Decisions (locked)

| Decision | Choice |
| --- | --- |
| Old map-based borders | **Deleted entirely** (route guts, MapView usage, borders-only map helpers) |
| Water borders | **Out of scope for v1** (parked; frame background already renders water) |
| Neighbours per question | **Cap at 6, randomly chosen** when a country has more; stable for the question |
| Answer model | Always identify per number. **Easy = matching, Difficult = typing** |
| Grading | **Fill all, submit once**; per-item ✓/✗ shown on reveal |
| Session mix | **Standalone** — Borders runs its own session, does not interleave with capitals/flags |
| Frame projection | Plain **Mercator per country** (local scale; looks like a map) |
| Easy distractors | Marked **"not shown"** by the player (no drag-to-bin) |

## Placement & menu

- `border` mode keeps its own group (`"borders"`) and its own route/store/screen.
- The standalone **Borders landing card is removed** (`CARDS` in `app/page.tsx`).
- The **Quiz card** gains a third option (Flags, Capitals, **Borders**). Capitals +
  Flags stay combinable and interleave. **Borders is mutually exclusive**: turning it
  on clears capital/flag; turning either of those on clears border.
- Routing: `border` selected → borders screen; `capital`/`flag` → `/quiz` (unchanged);
  `find`/`name` → `/map`; `build` → `/build`.

## The framed picture — `components/FrameView.tsx`

A **static SVG** rendered fresh per question with d3-geo. No zoom, pan, or answer-by-
clicking on the map itself (easy mode taps number badges; see below).

- **Projection & extent:** `geoBounds(target.feature)` → expand ~50% on each side →
  `geoMercator().fitExtent([[pad,pad],[w-pad,h-pad]], paddedBBoxFeature)`. The SVG is
  clipped to the frame rectangle.
- **What's drawn:** every country feature intersecting the frame bbox.
  - **Target** — brass fill; its **name is labelled** (the player names the neighbours,
    not the target).
  - **Numbered land neighbours** — neutral land fill + a circled number badge placed at
    the neighbour's projected centroid, clamped inside the frame toward its sliver.
  - **Other in-frame land** (non-neighbours, e.g. the UK when framing France) — faint
    fill. Realistic, and a natural source of "not shown" distractors.
  - **Water** — the navy frame background (no data; empty space).
- **Stability:** the shown/numbered set and their numbering are chosen once in the store
  at `next()`, so re-renders don't reshuffle.

## Which neighbours — pure logic in `lib/logic.ts` (unit-tested)

- **Shown/numbered** = the target's land neighbours (those with geometry/centroid),
  capped at 6. When there are more than 6, pick 6 at random (once per question). Extra
  neighbours remain visible in the picture but unnumbered and unasked.
- **Easy candidate list = always six names:** the numbered neighbours plus distractors
  to top up to six. Distractors are drawn preferentially from in-frame non-neighbour
  countries, falling back to same-region countries; they must genuinely not be land
  borders. Consequence: a 3-neighbour country → 3 real + 3 distractors; a country with
  ≥6 shown neighbours → 6 real, no distractors (e.g. China).

New pure helpers (each with a vitest test):
- pick-which-six (deterministic given a seed/shuffle hook, so it's testable)
- easy-candidate assembly (real neighbours + distractors, exactly six, no false borders)
- frame bounding-box math (expand `geoBounds` by the padding factor)

## Answering & grading

Both difficulties: **fill everything, then Submit once.**

- **Easy (matching):** the six candidate names are listed, each with a number-picker
  offering `1…n` (n = numbered neighbours) plus **"not shown"**. The player assigns all
  six, then submits. **Correct** = every real neighbour assigned its correct number AND
  every distractor marked "not shown".
- **Difficult (typing):** one `Autocomplete` box per number (`1…n`). Fill all, submit.
  **Correct** = every box matches its neighbour (`Logic.matchAnswer`).

Grading records a single Leitner verdict per target (`mode: "border"`, keyed on the
target id) — **all-or-nothing** for correct/incorrect, mirroring the old borders. The
reveal card shows per-item ✓/✗ and fills in any missed answers. Scoring, streaks, and
milestone effects mirror the existing quiz store.

## Store & files

- **Rewrite `store/borders-store.ts`** for the framed flow: per-question state holds the
  target, the shown/numbered neighbours (with their assigned numbers), the six easy
  candidates (when easy), the player's assignments/typed values, `answered`, and
  `reveal`. Actions: `start`, `next`, `assign`/`setTyped` (per slot), `submit`, `quit`.
  Submit grades once and records the verdict.
- **Rewrite `app/borders/page.tsx`**: render `FrameView` + the answer UI. Reuse
  `Autocomplete` (difficult) and a small matching grid (easy). Reuse `Scorebar`,
  `Results`, `StatsDashboard`, and the existing reveal card styling. No `MapViewComponent`.
- **New `components/FrameView.tsx`**: the static frame renderer described above.
- **Menu edit `app/page.tsx`**: drop the Borders card; add the exclusive Borders toggle
  to the Quiz card; adjust routing and the mode-exclusivity logic.
- **Remove dead map helpers**: `MapView.frameConstant` and `MapView.paintBorders` (used
  only by the old borders). Keep `frameCountry` (quiz-store `name` mode uses it). Verify
  no other references before deleting.

## Testing

- **Pure logic** (`lib/logic.ts`) gets vitest coverage: pick-which-six, easy-candidate
  assembly, frame bbox math.
- **Store** logic (grading correctness, all-or-nothing verdict, submit flow) unit-tested
  where practical, following the existing store test style.
- **FrameView (D3/SVG) and the page** are verified in a real browser per project
  convention (`next build && next start`, then drive it), not unit-tested.

## Out of scope for v1

- **Water borders** — salt/fresh or named bodies (Pacific, Gulf of Mexico). Needs a
  hand-authored country→water mapping; the frame already renders water as background so
  this can be layered on later.
- **Interleaving** borders with capitals/flags in one session.
