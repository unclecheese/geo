# Atlas — Geography Trainer

A geography learning tool: map quizzes, capital/flag/border drills, a continent
builder, and spaced repetition that resurfaces what you're weak on.

Originally a single `index.html` (vanilla JS + D3 off a CDN, no build). It's now a
Next.js app -- the old file is kept at the repo root as `index.html` for reference
until the cutover is done.

## Running

```sh
npm install
npm run dev      # http://localhost:3000
```

First load fetches map geometry, country metadata and flags, then caches them in
`localStorage`.

```sh
npm run build    # production build
npm test         # vitest -- pure logic + store + data-layer suites
```

## How it's built

- **Next.js App Router + TypeScript.** Four routes, one per screen: `/` (menu),
  `/map` (find / name), `/quiz` (capital / flag / borders), `/build` (continent
  builder).
- **Pure logic in `lib/`** -- `logic` (Leitner, selection, grading, distractors),
  `build-graph`, `placement`. No DOM, no D3; unit-tested in isolation.
- **State in `store/`** (Zustand). `atlas-store` is the durable progress
  (settings, Leitner boxes, history, stats), persisted to `localStorage` under
  `geo.state.v2`. `quiz-store` / `build-store` hold the ephemeral session.
- **D3 stays D3.** The map and builder are imperative D3 modules (`lib/map-view`,
  `lib/build-view`) attached to a React-owned `<svg>` via a ref -- React owns the
  element and its lifecycle, D3 owns everything inside. They talk to the
  controllers through callbacks (`onSelect`, `onPlace`, …).
- **Data** -- `world-atlas` 50m TopoJSON for geometry, `mledoze/countries` for
  metadata, flags from flagcdn. Joined and cached in `lib/data-layer`.

## Deploying

Push to `main` and Vercel ships it. (Pre-Next, the project served the static
`index.html`; the cutover switches it to the Next build.)
