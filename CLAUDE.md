# GeoBean — project guide for agents

A browser geography trainer. The player drills countries through several quiz
families, and a Leitner spaced-repetition system resurfaces whatever they're
weak on. Runs entirely client-side; no backend, no database.

Product name in the UI is **GeoBean**; the repo/theme is sometimes called
"Atlas". Treat this as a personal playground project, not production software.

## Quiz families (each is a route + a store)

- **Map** (`/map`) — `find` (click the named country on the world map) and
  `name` (name the highlighted country). D3-driven.
- **Expert / Quiz** (`/quiz`) — `capital` and `flag`. No map.
- **Borders** (`/borders`) — frame a country, name every neighbour.
- **Build** (`/build`) — drag every country into place to rebuild a continent.
- `/` is the menu / session setup.

`name`, `capital`, and `flag` honour a **difficulty** switch: `easy` = multiple
choice, `difficult` = type the answer (autocomplete). `find` is always
click-the-map. Map quizzes have **free hints**: find reveals region → subregion
→ border countries; name eliminates a wrong option (easy) or reveals name
letters hangman-style (difficult).

## Stack & commands

Next.js 15.5 (App Router) · React · TypeScript · **zustand** (persisted) ·
**d3** + **topojson-client**. Plain CSS (no Tailwind) in `app/globals.css` — a
"Field Atlas" theme driven by CSS variables (parchment surfaces on navy, serif
type, brass/forest accents). Tests via **vitest**.

```sh
npm run dev      # http://localhost:3000
npm run build && npm run start
npm test         # vitest run  (npm run test:watch to watch)
npx tsc --noEmit # typecheck
```

`app/../index.html` (~3k lines) is the **original single-file app**, kept at the
repo root for reference only. It is not part of the build — don't edit it.

## Architecture

**Browser-only singletons** hold the heavy mutable state; React owns the DOM
refs, the singleton owns everything inside:

- `lib/data-layer.ts` — `DataLayer`: fetches + joins country metadata and
  geometry, exposes `countries`, `byCcn3`, `features`, `featureById`. Loaded
  once by `components/DataProvider.tsx`, which gates the app behind a loading
  screen until `DataLayer.countries` is populated.
- `lib/map-view.ts` — `MapView`: the D3 map (projection, zoom, country paths,
  tiny-island boxes, highlights, arrows). `components/MapView.tsx` gives it the
  `<svg>`. **Import it dynamically** (`await import("@/lib/map-view")`) from
  stores/pages — it's client-only and keeps the store↔view dependency out of
  the module graph / SSR.
- `lib/build-view.ts` — `BuildView`: the continent-builder D3 canvas.

**Pure logic lives in `lib/logic.ts`** (`Logic`): no DOM, no D3. Leitner
(`leitnerUpdate`, `itemWeight`, `selectNextItem`), `filterPool` (multi-select),
`makeChoices` (smart distractors), `revealName`/`letterCount` (hangman),
`nextEliminate` (50/50 hint), `haversineKm`, `levenshtein`, `normalize` /
`matchAnswer`, `sanitizeModes`, `isTiny`. **Convention: new decision logic goes
here with a unit test**, so it's testable without a browser.

**Stores** (`store/`, zustand):
- `atlas-store.ts` — persisted settings + Leitner + history + stats
  (`setSettings`, `recordVerdict`, `migrateState`). This is the durable state.
- `quiz-store.ts` — the live session for map + expert modes. State includes
  `current`, `choices` (MC options; `[]` ⇒ the question is typed), `answered`,
  `reveal`, `choiceResult`, and hint fields `hintLevel` / `eliminatedIds` /
  `revealedCount` (reset each `next()`). Actions: `start`, `next`, `grade`,
  `handleChoice`, `handleTyped`, `handleMapSelect`, `useHint`.
- `borders-store.ts`, `build-store.ts`, `toast-store.ts`.

**Components**: `MapView`, `Autocomplete` (typed answers), `Choices` (MC grid,
shared by map + expert), `Results`, `Reveal`, `Scorebar`, `StatsDashboard`,
`DataProvider`, `BuildView`, `Toast`, `FxCanvas`, `Sparkline`.

## Data model

- **Metadata**: `mledoze/countries@5.1.0` `countries.json`. **Geometry**:
  `world-atlas@2` `countries-50m.json` (TopoJSON). Both from jsdelivr — URLs in
  `lib/constants.ts`.
- Cached in `localStorage`: dataset under `geo.dataset.v2`, settings/progress
  under `geo.state.v2` (zustand persist, `STATE_VERSION`, `migrateState` upgrades
  old saves — e.g. the single-string `region`/`subregion` → arrays migration).
- **The dataset has NO population or economic data** (only `area`, `latlng`,
  `borders`, `region`, `subregion`). Any "major/easy countries" feature needs a
  curated list, not a computed heuristic. (This feature is currently parked.)
- **Coordinate order is inconsistent by source — mind it**: `Country.latlng` is
  `[lat, lng]` (from mledoze); `Country.centroid` is `[lng, lat]` (from d3
  `geoCentroid`, computed on the largest polygon). `haversineKm` expects
  `[lat, lng]`.
- `Settings` shape (see `lib/types.ts`): `modes[]`, `regions[]` (empty = whole
  world), `subregions[]` (empty = all), `quizDifficulty` (`"easy"|"difficult"`),
  `session`, `roundLen`, `timed`, `sound`, `heatmap`, `showNames`,
  `buildDifficulty`, `rotateRandom`. Build uses `regions[0]` as its single
  continent (supported continents in `lib/build-graph.ts`).

## world-atlas 50m quirks (already handled — don't regress)

- id `"036"` appears **twice** (Australia + the tiny Ashmore reef); `DataLayer`
  keeps the geographically largest feature per id.
- Five features have `id: undefined` (Somaliland, Kosovo, N. Cyprus, …); they're
  skipped when indexing by ccn3.
- A country's bounding box ≠ its land area (scattered archipelagos). Tiny-island
  detection uses **largest-polygon area as a fraction of the projected sphere**
  (viewport-independent). Tiny *islands* (no land border) get padded, mutually
  non-overlapping outline boxes clamped off neighbouring coastlines; map clicks
  resolve by point-in-box then nearest-centroid.

## Conventions

- **NZ/British spelling** in user-facing copy (colour, centre, neighbour…).
- Match the existing CSS-variable theme; reuse patterns (`.seg`, `.bsel` /
  `.border-grid`, `.toggle`/`.switch`, `.choice`/`.choices`) rather than
  inventing new ones.
- Comments state constraints/rationale, not narration.
- Tests cover pure logic (`lib/logic.ts`) and stores. D3 views and React pages
  are **not** unit-tested — verify those in a real browser.

## Verifying map/UI changes in a browser

`next build && next start`, then drive it (chrome-devtools MCP works well). Two
recurring gotchas:
- jsdelivr **rate-limits** repeated dataset fetches, which can hang the loading
  screen (it doesn't retry). If stuck, seed `localStorage['geo.dataset.v2']`
  from a manual `fetch` of the two URLs, then reload.
- **Only run one `next start` per port** — a stale second server serves
  mismatched chunk hashes (404/400s, unstyled/stuck page). Kill strays first.

## Git & deploy

- This repo is a playground: **commit and push directly to `main`, no PRs**.
- **A push to GitHub does NOT auto-deploy.** Deploy explicitly with
  `vercel deploy --prod --yes` (the project is CLI-linked, `.vercel/` is
  gitignored). Production alias: `geo-pi-two.vercel.app`.
- Only commit/push/deploy when asked.
