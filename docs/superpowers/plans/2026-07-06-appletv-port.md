# GeoBean Apple TV Port — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-06-appletv-port-design.md` — read it first; all decisions there are locked.

**Goal:** Ship GeoBean as a native Apple TV app (react-native-tvos) sharing one quiz/Leitner core with the web app, with a touchpad cursor for find-the-country, focus-driven UI everywhere else, and system-dictation for typed answers.

**Architecture:** The repo becomes a monorepo: `packages/core` (`@geobean/core`) holds all platform-free logic, stores, and the data layer behind three injected ports (`KVStorage`, `MapPort`, `FxPort`); `apps/web` is the existing Next.js app re-pointed at core; `apps/tv` is a new react-native-tvos app that renders the map with `@shopify/react-native-skia` + `d3-geo` and registers its own port implementations.

**Tech Stack:** npm workspaces · TypeScript · zustand 5 · d3-geo · topojson-client · Next.js 15.5 (web) · react-native-tvos (latest, tracks RN 0.8x) · @shopify/react-native-skia ≥ 1.9 · @react-navigation/native · @react-native-async-storage/async-storage · vitest (core/web) · jest (tv, from the RN template).

## Global Constraints

- **NZ/British spelling** in all user-facing copy (colour, centre, neighbour, …).
- **`packages/core` must not touch `window`, `document`, `localStorage`, or any RN API.** Platform access goes through the ports defined in Task 3/4. `typeof window` guards are allowed only inside `apps/web`.
- **Pure decision logic goes in core with a vitest unit test** (project convention).
- **Views are not unit-tested** — D3/Skia views and React screens are verified via typecheck + build + simulator/browser checklist. Their tasks gate on those instead of a failing unit test.
- `Country.latlng` is `[lat, lng]`; `Country.centroid` is `[lng, lat]`; d3 projections take `[lng, lat]` and `projection.invert` returns `[lng, lat]`.
- **Web map projection is `geoEqualEarth`; the TV map must use the same.** Borders frames use `geoMercator` on both platforms.
- **Menu/Back on the Siri Remote is reserved** (Apple HIG): it must always navigate back / exit — never a quiz control.
- **Do not edit `index.html`** at the repo root (reference copy of the original app; excluded from builds).
- jsdelivr **rate-limits** repeated dataset fetches — in browsers/simulators, seed the cache from a manual fetch if the loading screen hangs (see CLAUDE.md).
- **A push does not deploy.** Deploy the web app only in Task 6 with `vercel deploy --prod --yes`, and only after Aaron confirms.
- Commit after each task, matching repo style (`Core: …`, `Web: …`, `TV: …`, short imperative subject).
- Phases must land in order (0 → 6); tasks within a phase are ordered too. Tasks in Phases 2+ contain RN/Skia code written before the scaffold existed — treat signatures from `@geobean/core` as fixed, but re-validate RN library APIs against the installed versions before coding.

---

## File Structure (end state)

```
geo/
  package.json                 # root: workspaces ["apps/web", "packages/core"], proxy scripts
  packages/core/
    package.json               # @geobean/core — deps: zustand, d3-geo, topojson-client
    tsconfig.json
    vitest.config.ts
    src/
      index.ts                 # barrel: everything below
      logic.ts  types.ts  constants.ts  modes.ts  ru-fix.ts  placement.ts   # moved verbatim
      data-layer.ts            # moved; localStorage → KVStorage
      platform.ts              # KVStorage interface + registry          (Task 3)
      ports.ts                 # MapPort/FxPort interfaces + registries  (Task 4)
      tiny-boxes.ts            # tiny-island box layout + click resolve  (Task 5)
      stores/
        atlas-store.ts  quiz-store.ts  borders-store.ts  toast-store.ts # moved + ports
      __tests__/               # all existing core tests move here + new ones
  apps/web/                    # the entire current Next.js app, moved
    app/  components/  public/
    lib/                       # ONLY web-only modules stay: map-view.ts, build-view.ts,
                               #   fx.ts, build-graph.ts, og.tsx, use-hydrated.ts,
                               #   use-pinch-guard.ts, platform-web.ts (new), ports-web.ts (new)
    store/build-store.ts       # build is web-only; stays here
    next.config.ts  tsconfig.json  vitest.config.ts  vercel.json  package.json
  apps/tv/                     # react-native-tvos app — NOT an npm workspace (own lockfile,
    package.json               #   depends on "@geobean/core": "file:../../packages/core")
    metro.config.js  tsconfig.json  ios/  ...template files
    src/
      theme.ts                 # Field Atlas palette ported from globals.css :root
      App.tsx  navigation.tsx
      platform-tv.ts           # AsyncStorage KVStorage adapter + rehydrate
      screens/  LoadingGate.tsx  MenuScreen.tsx  MapQuizScreen.tsx
                ExpertQuizScreen.tsx  BordersQuizScreen.tsx  ResultsScreen.tsx  StatsScreen.tsx
      map/      SkiaPathContext.ts  TvMap.tsx  tv-map-controller.ts
      input/    cursor-logic.ts  useRemoteInput.ts  hit-test.ts
      components/ ChoicesGrid.tsx  TypedAnswer.tsx  HintPanel.tsx  Scorebar.tsx  RevealCard.tsx
```

Task order: 1 workspaces → 2 core package → 3 storage seam → 4 map/fx ports → 5 tiny-box extraction → 6 web regression+deploy → 7 tv scaffold → 8 tv data+menu → 9 skia map → 10 map controller → 11 cursor input → 12 hit-testing → 13 find quiz → 14 choices/name/results → 15 expert → 16 typed input → 17 borders → 18 polish.

---

# Phase 0 — Monorepo refactor (web only; TV untouched)

### Task 1: npm workspaces + move the web app to `apps/web`

**Files:**
- Create: root `package.json` (rewritten), `apps/web/package.json`
- Move: `app/ components/ lib/ store/ public/ next.config.ts next-env.d.ts tsconfig.json vitest.config.ts vercel.json` → `apps/web/`
- Stay at root: `index.html`, `README.md`, `CLAUDE.md`, `docs/`, `settings.local.json`

**Interfaces:**
- Consumes: nothing.
- Produces: workspace layout every later task assumes; root scripts `npm run dev|build|test` proxying to the web workspace.

- [ ] **Step 1: Move the app**

```bash
cd /Users/aaroncarlino/Projects/geo
mkdir -p apps/web
git mv app components lib store public next.config.ts next-env.d.ts tsconfig.json vitest.config.ts vercel.json apps/web/
git mv package.json apps/web/package.json
rm -rf node_modules tsconfig.tsbuildinfo
```

- [ ] **Step 2: Write the two package.json files**

Root `package.json`:

```json
{
  "name": "geobean",
  "private": true,
  "workspaces": ["apps/web", "packages/core"],
  "scripts": {
    "dev": "npm run dev -w web",
    "build": "npm run build -w web",
    "start": "npm run start -w web",
    "test": "npm run test -ws --if-present",
    "typecheck": "npm run typecheck -ws --if-present"
  }
}
```

Edit `apps/web/package.json`: change `"name": "atlas"` → `"name": "web"`, keep every dependency exactly as-is, and add a script `"typecheck": "tsc --noEmit"`.

- [ ] **Step 3: Install and verify**

```bash
npm install
npm run typecheck && npm test && npm run build
```

Expected: tsc clean; all existing vitest suites pass (logic, placement, build-graph, ru-fix, data-layer, atlas/quiz/borders stores); `next build` succeeds. The `@/*` tsconfig path is relative to `apps/web`, so imports work unchanged. If `next build` complains about the workspace root (Next 15 infers monorepo roots), add `outputFileTracingRoot: path.join(__dirname, "../..")` to `next.config.ts`.

- [ ] **Step 4: Browser smoke test**

`npm run dev`, open http://localhost:3000 — menu renders, a map find round starts, a country click grades.

- [ ] **Step 5: Update the Vercel project root**

The CLI-linked project (`.vercel/project.json` at repo root) now needs Root Directory = `apps/web`: Vercel dashboard → project → Settings → Build & Deployment → Root Directory → `apps/web`. Do **not** deploy yet (Task 6 does). Record the change in the commit message body.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Repo: npm workspaces — web app moves to apps/web"
```

---

### Task 2: `@geobean/core` package with the pure modules

**Files:**
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/vitest.config.ts`, `packages/core/src/index.ts`
- Move: `apps/web/lib/{logic,types,constants,modes,ru-fix,placement}.ts` → `packages/core/src/`
- Move: `apps/web/lib/__tests__/{logic,placement,ru-fix}.test.ts` → `packages/core/src/__tests__/` (build-graph.test.ts STAYS in web — build is web-only)
- Modify: `apps/web/next.config.ts`, every web file importing the moved modules

**Interfaces:**
- Consumes: Task 1 layout.
- Produces: package `@geobean/core` whose barrel exports (used by every later task): `Logic`, `MODES`, `EXTRA_SOVEREIGN`, `DATA_KEY`, `STATE_KEY`, `STATE_VERSION`, `TOPO_URL`, `REST_URL`, `BOX_COLORS`, all types from `types.ts` (`Country`, `Settings`, `AtlasState`, `ModeId`, `ModeGroup`, `QuizDifficulty`, `HistoryEntry`, …), and the `ru-fix`/`placement` exports.

- [ ] **Step 1: Create the package**

`packages/core/package.json` — the package ships TypeScript source; web transpiles it via Next, TV via Metro:

```json
{
  "name": "@geobean/core",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": {
    "d3-geo": "^3.1.0",
    "topojson-client": "^3.1.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/d3-geo": "^3.1.0",
    "@types/geojson": "^7946.0.14",
    "@types/topojson-client": "^3.1.5",
    "typescript": "^5.7.0",
    "vitest": "^2.1.0"
  }
}
```

`packages/core/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src/**/*.ts"]
}
```

Note `"lib": ["esnext"]` — **no `dom`**. This is the compiler-enforced teeth behind the "core is platform-free" constraint: any leftover `window`/`localStorage` reference fails `typecheck`.

`packages/core/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

- [ ] **Step 2: Move the modules and fix their imports**

```bash
mkdir -p packages/core/src/__tests__
git mv apps/web/lib/{logic,types,constants,modes,ru-fix,placement}.ts packages/core/src/
git mv apps/web/lib/__tests__/{logic,placement,ru-fix}.test.ts packages/core/src/__tests__/
```

Inside the moved files, imports were relative (`./types`, `./constants`) and mostly keep working. Two fixes:
- Any `from "d3"` in the moved files becomes `from "d3-geo"` (core depends on `d3-geo` only — the full `d3` bundle drags in DOM-flavoured packages the TV bundle must not see). Check `placement.ts` and `ru-fix.ts`; `logic.ts` is d3-free.
- Test files: update relative paths (`../logic` etc. — they now live in `src/__tests__` next to `src/`).

- [ ] **Step 3: Write the barrel**

`packages/core/src/index.ts`:

```ts
export { Logic } from "./logic";
export { MODES, EXTRA_SOVEREIGN } from "./modes";
export * from "./constants";
export * from "./types";
export * from "./ru-fix";
export * from "./placement";
```

(Exact re-export lists for `ru-fix`/`placement`: keep `export *` — they're small modules with no name collisions.)

- [ ] **Step 4: Re-point web imports**

In `apps/web`, every `@/lib/logic`, `@/lib/types`, `@/lib/constants`, `@/lib/modes`, `@/lib/ru-fix`, `@/lib/placement` import becomes `@geobean/core`:

```bash
cd apps/web
grep -rl '@/lib/\(logic\|types\|constants\|modes\|ru-fix\|placement\)' app components lib store \
  | xargs sed -i '' 's|@/lib/\(logic\|types\|constants\|modes\|ru-fix\|placement\)|@geobean/core|g'
```

Files with two such imports end up with duplicate `from "@geobean/core"` lines — merge them by hand (grep for `@geobean/core` and eyeball each file; TypeScript tolerates split imports, so only merge where trivial). Add to `apps/web/package.json` dependencies: `"@geobean/core": "*"`, and to `apps/web/next.config.ts`: `transpilePackages: ["@geobean/core"]`.

- [ ] **Step 5: Verify**

```bash
cd /Users/aaroncarlino/Projects/geo
npm install
npm run typecheck && npm test && npm run build
```

Expected: core's vitest runs the 3 moved suites green in a node environment; web's suites still green; build clean.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Core: extract @geobean/core with pure logic modules"
```

---

### Task 3: `KVStorage` seam — data-layer and atlas-store move to core

**Files:**
- Create: `packages/core/src/platform.ts`
- Move + modify: `apps/web/lib/data-layer.ts` → `packages/core/src/data-layer.ts`; `apps/web/store/atlas-store.ts` → `packages/core/src/stores/atlas-store.ts`; `apps/web/store/toast-store.ts` → `packages/core/src/stores/toast-store.ts`
- Move + modify tests: `apps/web/lib/data-layer.test.ts`, `apps/web/store/atlas-store.test.ts` → `packages/core/src/__tests__/`
- Create: `apps/web/lib/platform-web.ts`
- Modify: `apps/web/components/DataProvider.tsx`, web files importing the moved stores

**Interfaces:**
- Consumes: `@geobean/core` barrel (Task 2).
- Produces (all exported from the barrel):
  - `interface KVStorage { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void>; remove(key: string): Promise<void>; }`
  - `setKVStorage(s: KVStorage): void`, `getKVStorage(): KVStorage | null`
  - `DataLayer` (unchanged API: `load`, `countries`, `byCcn3`, `byCca3`, `features`, `featureById`, `topo`, `pad3`, `largestPolygonCentroid`)
  - `useAtlasStore`, `defaultState`, `migrateState` — **persist now has `skipHydration: true`**; platforms must call `useAtlasStore.persist.rehydrate()` after `setKVStorage(...)`.
  - `useToastStore` / `toast` (moved verbatim, no changes — it's pure zustand).

- [ ] **Step 1: Write the failing test**

`packages/core/src/__tests__/platform.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { setKVStorage, getKVStorage, type KVStorage } from "../platform";

export function memoryKV(): KVStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    async get(k) { return data.get(k) ?? null; },
    async set(k, v) { data.set(k, v); },
    async remove(k) { data.delete(k); },
  };
}

describe("KVStorage registry", () => {
  it("returns null before registration and the adapter after", () => {
    setKVStorage(null as unknown as KVStorage); // reset between test files
    expect(getKVStorage()).toBeNull();
    const kv = memoryKV();
    setKVStorage(kv);
    expect(getKVStorage()).toBe(kv);
  });
});
```

Run: `npm test -w @geobean/core` — FAIL (`../platform` does not exist).

- [ ] **Step 2: Implement `platform.ts`**

```ts
/** Platform-injected key-value storage. Async-first so AsyncStorage (TV) and
 *  localStorage (web, wrapped in resolved promises) share one interface. */
export interface KVStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

let kv: KVStorage | null = null;
export function setKVStorage(s: KVStorage | null): void { kv = s; }
export function getKVStorage(): KVStorage | null { return kv; }
```

Run the test — PASS.

- [ ] **Step 3: Move + refactor `data-layer.ts`**

`git mv apps/web/lib/data-layer.ts packages/core/src/data-layer.ts`. Fix imports (`./constants`, `./modes`, `./types` still relative; `from "d3"` → `from "d3-geo"`). Replace the storage bits — delete `hasStorage` and rewrite `_readCache`/`_writeCache` (async now, so `load()` awaits the cache read):

```ts
  async load(onStatus?: (msg: string) => void): Promise<{ fromCache: boolean }> {
    const cached = await this._readCache();
    // ...rest of load() unchanged, except `this._writeCache(topo, meta)` gains `await`
  },

  async _readCache(): Promise<CacheBlob | null> {
    const kv = getKVStorage();
    if (!kv) return null;
    try {
      const raw = JSON.parse((await kv.get(DATA_KEY)) || "null");
      if (raw && raw.topo && raw.meta && Array.isArray(raw.meta)) return raw as CacheBlob;
    } catch { /* ignore */ }
    return null;
  },

  async _writeCache(topo: Topo, meta: RawMeta[]): Promise<void> {
    const kv = getKVStorage();
    if (!kv) return;
    try {
      await kv.set(DATA_KEY, JSON.stringify({ topo, meta, t: Date.now() }));
    } catch { /* dataset too big for quota — fine, refetch next time */ }
  },
```

with `import { getKVStorage } from "./platform";` at the top. Add `export * from "./data-layer";` and `export * from "./platform";` to the barrel.

- [ ] **Step 4: Move + refactor `atlas-store.ts`**

`git mv apps/web/store/atlas-store.ts packages/core/src/stores/atlas-store.ts` (fix relative imports: `../logic`, `../constants`, `../types`). Replace `hasStorage` + `legacyAwareStorage` with a KVStorage-backed version — same legacy-unwrap logic, async:

```ts
import { getKVStorage } from "../platform";

const legacyAwareStorage: StateStorage = {
  getItem: async (name) => {
    const kv = getKVStorage();
    if (!kv) return null;
    const raw = await kv.get(name);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "state" in parsed) return raw; // already ours
      // Legacy bare single-file format → wrap + migrate into zustand's shape.
      return JSON.stringify({ state: migrateState(parsed), version: STATE_VERSION });
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => { await getKVStorage()?.set(name, value); },
  removeItem: async (name) => { await getKVStorage()?.remove(name); },
};
```

In the `persist` options add `skipHydration: true` (hydration must wait until a platform registers storage — otherwise the store would race an unregistered adapter and silently start from defaults). Everything else (merge, partialize, onRehydrateStorage, actions) stays byte-identical.

Also `git mv apps/web/store/toast-store.ts packages/core/src/stores/toast-store.ts` — no code changes. Barrel: `export * from "./stores/atlas-store"; export * from "./stores/toast-store";`.

- [ ] **Step 5: Move + adapt the tests**

Move `data-layer.test.ts` and `atlas-store.test.ts` into `packages/core/src/__tests__/`, fix import paths. In each test file's setup, register memory storage and hydrate:

```ts
import { setKVStorage } from "../platform";
import { useAtlasStore } from "../stores/atlas-store";
import { memoryKV } from "./platform.test";

beforeEach(async () => {
  setKVStorage(memoryKV());
  await useAtlasStore.persist.rehydrate();
});
```

Add one new test to `atlas-store.test.ts` proving the seam:

```ts
it("persists through the injected KVStorage", async () => {
  const kv = memoryKV();
  setKVStorage(kv);
  await useAtlasStore.persist.rehydrate();
  useAtlasStore.getState().setSettings({ roundLen: 25 });
  await new Promise((r) => setTimeout(r, 0)); // let async setItem flush
  const raw = kv.data.get(STATE_KEY);
  expect(raw).toBeTruthy();
  expect(JSON.parse(raw!).state.settings.roundLen).toBe(25);
});
```

Run: `npm test -w @geobean/core` — PASS.

- [ ] **Step 6: Web adapter + wiring**

`apps/web/lib/platform-web.ts`:

```ts
import { setKVStorage, useAtlasStore } from "@geobean/core";

/** localStorage → KVStorage. Sync under the hood; promises for the shared interface. */
export function registerWebPlatform(): void {
  const ok = typeof window !== "undefined" && !!window.localStorage;
  setKVStorage({
    async get(k) { return ok ? localStorage.getItem(k) : null; },
    async set(k, v) { if (ok) localStorage.setItem(k, v); },
    async remove(k) { if (ok) localStorage.removeItem(k); },
  });
  void useAtlasStore.persist.rehydrate();
}
```

In `apps/web/components/DataProvider.tsx`, call `registerWebPlatform()` **before** `DataLayer.load(...)` (top of the existing load effect — it's a client component, so `window` exists). Re-point all web imports of `@/lib/data-layer`, `@/store/atlas-store`, `@/store/toast-store` to `@geobean/core` (same sed + merge approach as Task 2 Step 4). `lib/map-view.ts`, `lib/build-view.ts`, `store/build-store.ts`, `store/quiz-store.ts`, `store/borders-store.ts` are among the importers.

- [ ] **Step 7: Verify + commit**

```bash
npm run typecheck && npm test && npm run build
```

Then `npm run dev` and check in the browser: existing progress survives (localStorage `geo.state.v2` still hydrates — settings and stats show your history), dataset loads (or comes from cache), a round plays. **Hydration regression to watch:** the settings screen must not flash defaults — `_hasHydrated` still gates via `onRehydrateStorage`, now triggered by the explicit `rehydrate()`.

```bash
git add -A && git commit -m "Core: KVStorage seam — data-layer, atlas-store, toast-store move to core"
```

---

### Task 4: `MapPort` + `FxPort` seams — quiz-store and borders-store move to core

**Files:**
- Create: `packages/core/src/ports.ts`
- Move + modify: `apps/web/store/quiz-store.ts` → `packages/core/src/stores/quiz-store.ts`; `apps/web/store/borders-store.ts` → `packages/core/src/stores/borders-store.ts`; their tests → `packages/core/src/__tests__/`
- Create: `apps/web/lib/ports-web.ts`
- Modify: `apps/web/components/DataProvider.tsx`, web importers of the two stores

**Interfaces:**
- Consumes: Tasks 2–3.
- Produces (barrel-exported; the TV app implements these in Tasks 10 and 18):

```ts
export interface MapPort {
  isReady(): boolean;
  readonly tinyIds: Set<string>;
  clearHighlights(): void;
  flashSelect(id: string): void;
  frameCountry(c: Country, pad?: number): void;
  markArrow(c: Country): void;
  paint(id: string, kind: "good" | "bad" | "target" | "sel"): void;
  refreshColors(): void;
  reset(): void;
}
export interface FxPort {
  hint(): void; correct(): void; wrong(): void; milestone(): void; confetti(): void;
}
export function setMapPort(p: MapPort | null): void;
export function mapPort(): MapPort | null;   // null when unregistered OR !isReady()
export function setFxPort(p: FxPort): void;
export function fx(): FxPort;                // default: all no-ops
```

- [ ] **Step 1: Write the failing test**

`packages/core/src/__tests__/ports.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { setMapPort, mapPort, fx, type MapPort } from "../ports";

const fake = (ready: boolean): MapPort => ({
  isReady: () => ready,
  tinyIds: new Set<string>(),
  clearHighlights() {}, flashSelect() {}, frameCountry() {}, markArrow() {},
  paint() {}, refreshColors() {}, reset() {},
});

describe("ports", () => {
  it("mapPort() is null when nothing registered", () => {
    setMapPort(null);
    expect(mapPort()).toBeNull();
  });
  it("mapPort() hides a not-ready implementation", () => {
    setMapPort(fake(false));
    expect(mapPort()).toBeNull();
  });
  it("mapPort() returns a ready implementation", () => {
    const p = fake(true);
    setMapPort(p);
    expect(mapPort()).toBe(p);
  });
  it("fx() defaults to safe no-ops", () => {
    expect(() => { fx().correct(); fx().confetti(); }).not.toThrow();
  });
});
```

Run: `npm test -w @geobean/core` — FAIL (`../ports` missing).

- [ ] **Step 2: Implement `ports.ts`**

```ts
import type { Country } from "./types";

/** The map-view surface the quiz store drives. Web registers MapView; TV
 *  registers its Skia controller; expert/borders run with none registered. */
export interface MapPort {
  isReady(): boolean;
  readonly tinyIds: Set<string>;
  clearHighlights(): void;
  flashSelect(id: string): void;
  frameCountry(c: Country, pad?: number): void;
  markArrow(c: Country): void;
  paint(id: string, kind: "good" | "bad" | "target" | "sel"): void;
  refreshColors(): void;
  reset(): void;
}

export interface FxPort {
  hint(): void; correct(): void; wrong(): void; milestone(): void; confetti(): void;
}

let _map: MapPort | null = null;
export function setMapPort(p: MapPort | null): void { _map = p; }
export function mapPort(): MapPort | null { return _map && _map.isReady() ? _map : null; }

const NOOP_FX: FxPort = { hint() {}, correct() {}, wrong() {}, milestone() {}, confetti() {} };
let _fx: FxPort = NOOP_FX;
export function setFxPort(p: FxPort): void { _fx = p; }
export function fx(): FxPort { return _fx; }
```

Barrel: `export * from "./ports";`. Test — PASS.

- [ ] **Step 3: Move + refactor `quiz-store.ts`**

`git mv apps/web/store/quiz-store.ts packages/core/src/stores/quiz-store.ts`; fix imports to relative (`../logic`, `../modes`, `../data-layer`, `../types`, `./atlas-store`, `./toast-store`) and add `import { mapPort, fx } from "../ports";`. Delete the `Audio2, Confetti` import. Then apply these mechanical rewrites — the store has **ten** `import("@/lib/map-view")` sites (next ×2 in-function, handleMapSelect ×3, handleChoice, grade, finish, quit) and they all follow the same two shapes:

```ts
// BEFORE (async, dynamic import, _inited guard):
import("@/lib/map-view").then(({ MapView }) => {
  if (MapView._inited) MapView.clearHighlights();
});
// AFTER (sync, port):
mapPort()?.clearHighlights();
```

Multi-call sites keep their branching, e.g. the `next()` framing block becomes:

```ts
if (chosenMode === "find" || chosenMode === "name") {
  const map = mapPort();
  if (map) {
    if (chosenMode === "name") {
      if (map.tinyIds.has(item.id)) map.frameCountry(item, 0.5);
      else map.reset();
      map.paint(item.id, "target");
      map.markArrow(item);
    } else {
      map.reset();
    }
  }
}
```

(Note: with the sync port, the `item!` non-null assertions inside the old `.then` callbacks become plain `item` — the narrowed binding is still in scope.)

Fx rewrites: `Audio2.hint()` → `fx().hint()`, `Audio2.correct()` → `fx().correct()`, `Audio2.wrong()` → `fx().wrong()`, `Audio2.milestone()` → `fx().milestone()`, `Confetti.burst()` → `fx().confetti()` (8 sites).

- [ ] **Step 4: Move + refactor `borders-store.ts`**

Same treatment: `git mv`, relative imports, delete the fx import, rewrite its `Audio2`/`Confetti` calls to `fx().…`. It never touches MapView (the framed quiz is store-free rendering), so no MapPort work. Barrel: `export * from "./stores/quiz-store"; export * from "./stores/borders-store";`.

- [ ] **Step 5: Move tests + add port coverage**

Move `quiz-store.test.ts` and `borders-store.test.ts` to `packages/core/src/__tests__/`, fix paths, keep the KVStorage setup from Task 3. The old tests presumably mocked the dynamic import (`vi.mock("@/lib/map-view", …)`) — delete those mocks; inject fakes instead. Add:

```ts
it("runs a find question safely with no MapPort registered", () => {
  setMapPort(null);
  // start a session with modes ["find"], answer via handleMapSelect
  // expect: no throw, verdict recorded, reveal set
});

it("frames tiny countries through the MapPort in name mode", () => {
  const calls: string[] = [];
  setMapPort({
    isReady: () => true,
    tinyIds: new Set(["TINY_ID"]),
    frameCountry: (c) => calls.push("frame:" + c.id),
    paint: (id, kind) => calls.push(`paint:${id}:${kind}`),
    markArrow: (c) => calls.push("arrow:" + c.id),
    reset: () => calls.push("reset"),
    clearHighlights() {}, flashSelect() {}, refreshColors() {},
  });
  // drive next() onto a name question whose target id is "TINY_ID"
  // expect calls to contain "frame:TINY_ID", "paint:TINY_ID:target", "arrow:TINY_ID"
});
```

(Flesh the two bodies out using the arrangement helpers already present in `quiz-store.test.ts` — it already fabricates countries and forces `current`; follow its existing patterns.) Run: `npm test -w @geobean/core` — PASS.

- [ ] **Step 6: Web port adapters**

`apps/web/lib/ports-web.ts`:

```ts
"use client";
import { setMapPort, setFxPort } from "@geobean/core";
import { MapView } from "@/lib/map-view";
import { Audio2, Confetti } from "@/lib/fx";

/** Bridge the browser singletons into core's ports. Client-only module —
 *  import it dynamically (map-view touches DOM at init). */
export function registerWebPorts(): void {
  setMapPort({
    isReady: () => MapView._inited,
    get tinyIds() { return MapView.tinyIds; },
    clearHighlights: () => MapView.clearHighlights(),
    flashSelect: (id) => MapView.flashSelect(id),
    frameCountry: (c, pad) => MapView.frameCountry(c, pad),
    markArrow: (c) => MapView.markArrow(c),
    paint: (id, kind) => MapView.paint(id, kind),
    refreshColors: () => MapView.refreshColors(),
    reset: () => MapView.reset(),
  });
  setFxPort({
    hint: () => Audio2.hint(),
    correct: () => Audio2.correct(),
    wrong: () => Audio2.wrong(),
    milestone: () => Audio2.milestone(),
    confetti: () => Confetti.burst(),
  });
}
```

(`get tinyIds()` is deliberate — `MapView.tinyIds` is *replaced* with a new Set on every map init, so the adapter must not capture a stale reference.) In `DataProvider.tsx`, alongside the platform registration: `import("@/lib/ports-web").then((m) => m.registerWebPorts());` — dynamic, keeping map-view out of SSR, same rule as CLAUDE.md prescribes for map-view imports. Re-point remaining web imports of the two stores to `@geobean/core`.

- [ ] **Step 7: Verify + commit**

```bash
npm run typecheck && npm test && npm run build
```

Browser regression (this task rewired live quiz behaviour — walk all of it):
- map find: click wrong country → red + target painted + arrow; click right → green, praise toast, sounds fire
- map name (easy): tiny country (e.g. Singapore) auto-frames + arrow; choice buttons grade
- expert capital/flag: rounds run with the map page never opened (no MapPort — must not throw)
- borders: a full frame round; hints; sounds
- streak of 5 → confetti + milestone sound; heatmap toggle recolours after grading

```bash
git add -A && git commit -m "Core: MapPort/FxPort seams — quiz and borders stores move to core"
```

---

### Task 5: Extract tiny-island box layout + click resolution into core

The find-quiz on TV needs the same "which country did I click" behaviour the web map has: tiny-island outline boxes take precedence, then nearest centroid. That geometry currently lives inside `apps/web/lib/map-view.ts` tangled with D3 drawing. Pull the **pure geometry** into core; leave drawing where it is.

**Files:**
- Create: `packages/core/src/tiny-boxes.ts`, `packages/core/src/__tests__/tiny-boxes.test.ts`
- Modify: `apps/web/lib/map-view.ts`

**Interfaces:**
- Consumes: `Logic.isTiny`, `largestPolygonCentroid`, `Country`, d3-geo's `GeoProjection` type.
- Produces (barrel-exported; Task 12 consumes on TV):

```ts
export interface TinyBox { id: string; x: number; y: number; w: number; h: number; }

/** Which countries count as tiny (drives name-mode close-framing), and which
 *  tiny ISLANDS get an outline box (no land border). Pure. */
export function computeTinyIds(countries: Country[]): Set<string>;

/** Padded, mutually non-overlapping, coast-clamped outline boxes for tiny
 *  islands, in projected (unzoomed) coordinates. Lifted verbatim from
 *  map-view.ts init — including _coastVertices. */
export function layoutTinyBoxes(
  countries: Country[], tinyIds: Set<string>, projection: GeoProjection,
  opts?: { boxSize?: number }
): TinyBox[];

/** Resolve a click/cursor point (projected, unzoomed coords) to a country:
 *  point-in-tiny-box first, then nearest projected centroid within
 *  `maxDistPx`, else null. */
export function resolvePoint(
  pt: [number, number], boxes: TinyBox[], countries: Country[],
  projection: GeoProjection, maxDistPx: number
): Country | null;
```

- [ ] **Step 1: Read the source** — `apps/web/lib/map-view.ts` lines ~195–260 (init: tiny detection + box layout, using `Logic.isTiny(largestPolygonArea / sphereArea)`), ~317 (`_coastVertices`), ~490–530 (click resolution). Understand exactly what moves: the math, not the `<rect>` drawing.

- [ ] **Step 2: Write failing tests** — `tiny-boxes.test.ts` with a synthetic dataset: three fabricated countries (one continental polygon, two tiny islands with adjacent centroids) under `geoEqualEarth().fitExtent([[0,0],[960,540]], { type: "Sphere" })`. Assert: `computeTinyIds` flags only the tinies; `layoutTinyBoxes` returns non-overlapping boxes (pairwise AABB check) containing their island's projected centroid within padding; `resolvePoint` inside box 1 → island 1, between boxes → nearest-centroid country, mid-ocean far from everything → null. Run — FAIL.

- [ ] **Step 3: Move the implementation** — lift the code blocks from map-view into the three functions, parameterising `projection` and dropping D3 selections. Run tests — PASS.

- [ ] **Step 4: Re-point map-view** — `map-view.ts` imports `computeTinyIds`/`layoutTinyBoxes`/`resolvePoint` from `@geobean/core`, keeps its own drawing of the boxes and its zoom-transform handling, deletes the lifted code. `MapView.tinyIds` is now `computeTinyIds(...)`'s result.

- [ ] **Step 5: Verify + commit** — `npm run typecheck && npm test && npm run build`; in the browser check tiny-island behaviour specifically: boxes render (Pacific/Caribbean), clicking a box selects the island, name-mode framing of Singapore still works.

```bash
git add -A && git commit -m "Core: extract tiny-box layout + point resolution from map-view"
```

---

### Task 6: Web regression gate + Vercel deploy

**Files:** none (verification + deploy only).

- [ ] **Step 1: Full local gate**

```bash
npm run typecheck && npm test && npm run build
```

- [ ] **Step 2: Browser pass** — `npm run build && npm run start` (kill stray `next start`s first — stale servers serve mismatched chunks, see CLAUDE.md), then the full checklist: menu settings persist across reload; map find with hints (region → subregion → borders); map name easy + difficult (hangman); expert capital + flag both difficulties; borders round; build round (untouched but re-verify — its store still imports core); stats dashboard renders history.

- [ ] **Step 3: Confirm with Aaron, then deploy**

Deployment is explicitly gated: confirm the Root Directory change from Task 1 Step 5 is saved in Vercel, then

```bash
vercel deploy --prod --yes
```

and smoke-test https://geo-pi-two.vercel.app (existing visitors' localStorage progress must survive — same keys, same shapes).

- [ ] **Step 4: Commit any fixes; tag the milestone**

```bash
git commit -am "Web: post-monorepo regression fixes" # only if fixes were needed
git tag monorepo-cutover
```

---

# Phase 1 — TV scaffold

> **Docs to consult before Phase 1–2 coding:** react-native-tvos README + wiki (https://github.com/react-native-tvos/react-native-tvos), the `SkiaMultiplatform` sample (https://github.com/react-native-tvos/SkiaMultiplatform), React Native Skia install docs, @react-navigation TV notes. Requires Xcode with the tvOS SDK and an Apple TV simulator runtime installed.

### Task 7: react-native-tvos app at `apps/tv`

`apps/tv` is deliberately **not** an npm workspace — RN's native tooling (pods, Metro) fights dependency hoisting. It keeps its own `node_modules` + lockfile and consumes core via a `file:` link.

**Files:**
- Create: `apps/tv/` (template output), then modify `apps/tv/package.json`, `apps/tv/metro.config.js`, `apps/tv/tsconfig.json`, `apps/tv/App.tsx`
- Modify: root `package.json` (convenience script), root `.gitignore` (tv artefacts)

**Interfaces:**
- Consumes: `@geobean/core` via `file:../../packages/core`.
- Produces: a booting tvOS app; `npm run tv` from the repo root; Metro configured to resolve core.

- [ ] **Step 1: Scaffold from the TV fork**

```bash
cd /Users/aaroncarlino/Projects/geo/apps
npx @react-native-community/cli@latest init GeoBeanTV --version npm:react-native-tvos@latest --directory tv --title "GeoBean"
cd tv && npx pod-install
```

(The tv fork's template generates the tvOS Xcode target. If the generated `ios/Podfile` contains an iOS-only platform line, the fork's template docs cover the tvOS target setup — follow them, don't hand-roll.)

- [ ] **Step 2: Boot the template**

```bash
npm run ios -- --simulator "Apple TV"
```

Expected: template screen on the Apple TV simulator. (Exact script name may differ by template version — check `apps/tv/package.json` scripts; some templates expose `npm run tvos`.)

- [ ] **Step 3: Link core**

In `apps/tv/package.json` dependencies add `"@geobean/core": "file:../../packages/core"`, then `npm install`. `apps/tv/metro.config.js` must watch the workspace and follow the symlink:

```js
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../..");
const config = {
  watchFolders: [path.resolve(repoRoot, "packages/core")],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, "node_modules"),
      path.resolve(repoRoot, "node_modules"),
    ],
  },
};
module.exports = mergeConfig(getDefaultConfig(__dirname), config);
```

Core ships raw TS — Metro transpiles it natively (RN's babel preset handles TS), no build step. `apps/tv/tsconfig.json`: extend the template's config and add

```json
{ "compilerOptions": { "paths": { "@geobean/core": ["../../packages/core/src/index.ts"] } } }
```

Note: `zustand`, `d3-geo`, `topojson-client` install into `apps/tv/node_modules` via the `file:` dep's transitive deps — if Metro can't resolve them, add them to `apps/tv` dependencies directly at the same versions as core.

- [ ] **Step 4: Prove core resolves on-device**

Replace the template `App.tsx` body with a smoke test:

```tsx
import { Text, View } from "react-native";
import { Logic, STATE_VERSION } from "@geobean/core";

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b1d33" }}>
      <Text style={{ color: "#f4e9d3", fontSize: 40 }}>
        GeoBean core v{STATE_VERSION} — levenshtein("colour","color") = {Logic.levenshtein("colour", "color")}
      </Text>
    </View>
  );
}
```

Run on the simulator. Expected: renders "… = 1". This proves Metro→core→zustand/d3-geo resolution end to end.

- [ ] **Step 5: Root conveniences + commit**

Root `package.json` scripts: `"tv": "npm run ios --prefix apps/tv -- --simulator \"Apple TV\""`. Root `.gitignore`: ensure `apps/tv/node_modules`, `apps/tv/ios/Pods`, `apps/tv/ios/build` are ignored (template usually provides its own .gitignore — verify).

```bash
git add -A && git commit -m "TV: react-native-tvos scaffold wired to @geobean/core"
```

---

### Task 8: TV platform wiring — storage, data load, navigation, menu

**Files:**
- Create: `apps/tv/src/platform-tv.ts`, `apps/tv/src/theme.ts`, `apps/tv/src/navigation.tsx`, `apps/tv/src/screens/LoadingGate.tsx`, `apps/tv/src/screens/MenuScreen.tsx`
- Modify: `apps/tv/App.tsx`

**Interfaces:**
- Consumes: `setKVStorage`, `useAtlasStore`, `DataLayer`, `Logic.sanitizeModes`, `Settings` from core.
- Produces:
  - `registerTvPlatform(): void` (storage + rehydrate; fx stays default no-op until Task 18)
  - `theme` object: `{ sea, land, landStroke, parchment, ink, brass, forest, good, bad, target }` — copy the actual hex values from `apps/web/app/globals.css` `:root` variables (single source of truth for the palette port; add a comment naming each source variable).
  - Stack navigator with routes `Menu | MapQuiz | ExpertQuiz | BordersQuiz | Results | Stats` (typed `RootStackParamList`).

- [ ] **Step 1: Storage adapter**

```bash
cd apps/tv && npm install @react-native-async-storage/async-storage @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context && npx pod-install
```

`apps/tv/src/platform-tv.ts`:

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setKVStorage, useAtlasStore } from "@geobean/core";

export function registerTvPlatform(): void {
  setKVStorage({
    get: (k) => AsyncStorage.getItem(k),
    set: (k, v) => AsyncStorage.setItem(k, v),
    remove: (k) => AsyncStorage.removeItem(k),
  });
  void useAtlasStore.persist.rehydrate();
}
```

- [ ] **Step 2: Loading gate**

`LoadingGate.tsx` mirrors web's `DataProvider`: on mount call `registerTvPlatform()` then `DataLayer.load(setStatus)`; render a status line (serif, parchment-on-navy) until `DataLayer.countries.length > 0`, then render children. On fetch failure show the error + a focusable "Retry" `Pressable`. AsyncStorage default quota comfortably holds the ~10 MB dataset blob; if `set` throws, the catch in `_writeCache` already degrades to refetching.

- [ ] **Step 3: Navigation + menu**

`navigation.tsx`: `createNativeStackNavigator<RootStackParamList>()`, all six screens, `headerShown: false`. `App.tsx` = `<NavigationContainer><LoadingGate><RootNavigator/></LoadingGate></NavigationContainer>`.

`MenuScreen.tsx` — the 10-foot session setup, FOCUS mode only. Reuse core state directly (`useAtlasStore`): mode toggles (Find / Name / Capital / Flag / Borders as segmented focusable buttons mirroring web's `.seg` pattern), region multi-select chips (`settings.regions`, empty = whole world), difficulty toggle, round length, and a Start button per family (Map / Expert / Borders). Start navigates to the family screen; the screen's mount effect calls the store's `start()` (quiz-store for Map/Expert, borders-store for Borders) — same contract the web pages use. Every control is a `Pressable` with visible focus styling:

```tsx
<Pressable
  onPress={onToggle}
  style={({ focused }) => [styles.seg, focused && styles.segFocused, active && styles.segActive]}
>
```

(In react-native-tvos, `Pressable`'s style callback and `onFocus`/`onBlur` receive TV focus state — use `focused` scale ≈ 1.08 + brass border, matching Field Atlas.)

- [ ] **Step 4: Verify in simulator**

Boot; dataset loads (watch for jsdelivr rate limiting — if the loader hangs, relaunch later or pre-seed AsyncStorage by letting one successful load complete); menu focus moves with the remote ring/swipes; settings persist across app relaunch (AsyncStorage). Set modes to capital-only easy and confirm navigation reaches a stub ExpertQuiz screen (placeholder `<Text>` for now).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "TV: platform wiring — AsyncStorage, data load, navigation, menu"
```

---

# Phase 2 — the Skia map

### Task 9: Skia world map renders

**Files:**
- Create: `apps/tv/src/map/SkiaPathContext.ts`, `apps/tv/src/map/TvMap.tsx`
- Modify: `apps/tv/package.json` (skia dep)

**Interfaces:**
- Consumes: `DataLayer.features`, `DataLayer.featureById`, `theme`.
- Produces:
  - `buildCountryPaths(projection: GeoProjection): Map<string, SkPath>` — id (padded ccn3) → Skia path, built once per session.
  - `<TvMap transform={MapTransform} paints={Map<string, PaintKind>} boxes={TinyBox[]} cursor={{x,y} | null} />` where `type MapTransform = { k: number; tx: number; ty: number }` and `type PaintKind = "good" | "bad" | "target" | "sel"`.
  - `PROJ`: the shared projection instance — `geoEqualEarth().fitExtent([[0, 0], [1920, 1080]], { type: "Sphere" })` (tvOS renders at 1080p points; same projection family as web's map-view).

- [ ] **Step 1: Install**

```bash
cd apps/tv && npm install @shopify/react-native-skia && npx pod-install && npm run ios -- --simulator "Apple TV"
```

Gate: the template app still boots with the Skia pod linked. **If the build fails on tvOS here, stop and compare against the `SkiaMultiplatform` sample before writing any map code** — this is the plan's named go/no-go point for Skia; the fallback is `react-native-svg` + `d3-geo` (same path data, `<Path d>` strings via `geoPath()` with no context argument).

- [ ] **Step 2: The path adapter**

`SkiaPathContext.ts` — d3-geo's `geoPath(projection, context)` calls a canvas-ish context; feed it a Skia path builder:

```ts
import { Skia, type SkPath } from "@shopify/react-native-skia";

/** Minimal GeoContext for d3-geo → Skia. d3 emits moveTo/lineTo/closePath for
 *  polygons and arc() only for point sprites (unused here). */
export class SkiaPathContext {
  path: SkPath = Skia.Path.Make();
  moveTo(x: number, y: number) { this.path.moveTo(x, y); }
  lineTo(x: number, y: number) { this.path.lineTo(x, y); }
  closePath() { this.path.close(); }
  arc(x: number, y: number, r: number, a0: number, a1: number) {
    this.path.addArc(
      { x: x - r, y: y - r, width: 2 * r, height: 2 * r },
      (a0 * 180) / Math.PI,
      ((a1 - a0) * 180) / Math.PI
    );
  }
}

export function buildCountryPaths(
  projection: GeoProjection, featureById: Map<string, Feature>
): Map<string, SkPath> {
  const gen = geoPath(projection);
  const out = new Map<string, SkPath>();
  for (const [id, f] of featureById) {
    const ctx = new SkiaPathContext();
    geoPath(projection, ctx as never)(f as never);
    out.set(id, ctx.path);
  }
  return out;
}
```

- [ ] **Step 3: The map component**

`TvMap.tsx`: a full-screen Skia `<Canvas>`; `useMemo(() => buildCountryPaths(PROJ, DataLayer.featureById), [])`; a sphere-backdrop `<Fill color={theme.sea} />`; a `<Group transform={[{ translateX: tx }, { translateY: ty }, { scale: k }]}>` containing one `<Path>` per country (`color` = paint override from the `paints` prop else `theme.land`, plus a `<Path style="stroke">` pass for borders with `strokeWidth={1 / k}` so borders stay constant on screen — same trick as web); tiny-island boxes as stroked `<Rect>`s inside the group; the cursor as two hairline lines + ring drawn **outside** the group (screen space). Antimeridian: 50m TopoJSON is already cut at ±180°, and web's Russia handling (`ru-fix.ts`) is in core — apply it to features the same way `map-view.ts` does before path-building (read how map-view consumes `ru-fix` and mirror it).

- [ ] **Step 4: Verify (visual)**

Render `<TvMap transform={{k:1,tx:0,ty:0}} …/>` on a stub screen. Checklist: whole world visible and centred; land parchment on navy sea; borders hairline-visible at k=1; no spike/winding artefacts (compare Russia, Fiji, Antarctica against the web map); relaunch twice to confirm path building stays under ~2s on simulator.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "TV: Skia world map — d3-geo paths, theme, transform group"
```

---

### Task 10: `TvMapController` — MapPort for television

**Files:**
- Create: `apps/tv/src/map/tv-map-controller.ts`
- Test: none (view-adjacent; verified in Task 13's simulator pass — but its transform math is delegated to pure helpers that ARE tested, see Step 2)

**Interfaces:**
- Consumes: `MapPort`, `setMapPort`, `computeTinyIds`, `layoutTinyBoxes`, `TinyBox`, `Logic.expandBounds`, `largestPolygonCentroid`, `PROJ`, `MapTransform`, `PaintKind`.
- Produces the object Task 13's screen instantiates:

```ts
export interface TvMapController extends MapPort {
  /** Subscribe the React component; called with every visual state change. */
  bind(onChange: (s: {
    transform: MapTransform;
    paints: Map<string, PaintKind>;
    boxes: TinyBox[];
    arrow: { x: number; y: number; angle: number } | null;
  }) => void): () => void;
  panBy(dxPx: number, dyPx: number): void;                 // dpad ring
  zoomToggle(cursorScreen: { x: number; y: number }): void; // double-click
  screenToProjected(pt: { x: number; y: number }): [number, number]; // for hit-testing
}
export function createTvMapController(): TvMapController;
```

- [ ] **Step 1: Implement state + MapPort surface**

Internal state: `transform` (start `{k:1, tx:0, ty:0}`), `paints: Map<string, PaintKind>`, `savedTransform: MapTransform | null` (for the zoom toggle), `tinyIds = computeTinyIds(DataLayer.countries)`, `boxes = layoutTinyBoxes(...)` (computed once). MapPort methods:
- `isReady()` — true once constructed (dataset is loaded before any screen mounts).
- `paint(id, kind)` — set in `paints`, notify.
- `clearHighlights()` — clear `paints` + arrow, notify.
- `reset()` — transform back to identity (and `savedTransform = null`), notify.
- `frameCountry(c, pad = 0.4)` — project `Logic.expandBounds(geoBounds(c.feature), pad)` corners, derive `k/tx/ty` to fit 1920×1080 (clamp k to the web's caps: max 7 tiny / 8 regular, min 1.4), notify.
- `markArrow(c)` — projected centroid + fixed angle; notify (TvMap draws a small brass arrow glyph pointing at it).
- `flashSelect(id)` — paint `sel`, `setTimeout` 600 ms → remove, notify twice.
- `refreshColors()` — no-op in v1 (heatmap is out of TV v1; leave a comment).
- `panBy(dx, dy)` — `tx += dx; ty += dy` clamped so the sphere never fully leaves the screen; notify.
- `zoomToggle({x, y})` — if `savedTransform` set: restore it, clear it. Else save current, then zoom **in** one step (k × 3, clamped to 8) keeping the cursor's map point fixed: `tx' = x - 3(x - tx)`, `ty' = y - 3(y - ty)`; notify.
- `screenToProjected({x, y})` — `[(x - tx)/k, (y - ty)/k]`.

- [ ] **Step 2: Pure transform helpers get tests**

The `zoomToggle`/`frameCountry` arithmetic is exactly the kind of thing that silently breaks — put it in core as pure functions with vitest coverage: `packages/core/src/map-transform.ts` exporting `zoomAt(t: MapTransform, pt: {x,y}, factor: number, maxK: number): MapTransform` and `fitBounds(pxBounds: [[number,number],[number,number]], viewport: {w,h}, minK: number, maxK: number): MapTransform`, plus `packages/core/src/__tests__/map-transform.test.ts` asserting: zooming at a point keeps that point invariant (`apply(t', pt) === apply(t, pt)`), factors compose, clamps hold, and `fitBounds` centres the box. Barrel-export both. The controller then just calls them. Run `npm test -w @geobean/core` — new tests pass.

- [ ] **Step 3: Registration contract**

The MapQuiz screen (Task 13) does `const ctl = useMemo(createTvMapController, [])`, `useEffect(() => { setMapPort(ctl); return () => setMapPort(null); }, [ctl])`. Nothing else registers a MapPort on TV — expert/borders screens run portless by design.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "TV: map controller implementing MapPort + tested transform math"
```

---

# Phase 3 — cursor and remote controls

### Task 11: Remote input — cursor logic + event plumbing

**Files:**
- Create: `apps/tv/src/input/cursor-logic.ts`, `apps/tv/src/input/useRemoteInput.ts`
- Test: `apps/tv/__tests__/cursor-logic.test.ts` (jest — the RN template ships it; run with `npm test` inside `apps/tv`)

**Interfaces:**
- Consumes: react-native-tvos `TVEventHandler` + `TVEventControl` (verify exact import against the installed version: `import { TVEventHandler, TVEventControl, useTVEventHandler } from "react-native"` in the tv fork).
- Produces:
  - Pure, jest-tested: `cursorReduce(c: CursorState, ev: PanSample, gain: number, bounds: {w,h}): CursorState` and `clickReduce(state: ClickState, nowMs: number): { state: ClickState; fire: "single" | "double" | null }` with `type CursorState = { x: number; y: number; lastSample: {x,y} | null }`, `type PanSample = { state: "Began" | "Changed" | "Ended"; x: number; y: number }`, `type ClickState = { pendingSince: number | null }`.
  - Hook: `useRemoteInput(handlers: { enabled: boolean; onCursor(c: {x,y}): void; onSingleClick(c: {x,y}): void; onDoubleClick(c: {x,y}): void; onDpad(dir: "up"|"down"|"left"|"right"): void; onPlayPause(): void; })`.

- [ ] **Step 1: Write failing jest tests for the pure reducers**

```ts
import { cursorReduce, clickReduce } from "../src/input/cursor-logic";

const B = { w: 1920, h: 1080 };

test("Began anchors without moving the cursor", () => {
  const c = cursorReduce({ x: 960, y: 540, lastSample: null }, { state: "Began", x: 0, y: 0 }, 1.6, B);
  expect([c.x, c.y]).toEqual([960, 540]);
  expect(c.lastSample).toEqual({ x: 0, y: 0 });
});

test("Changed applies gain-scaled deltas from the previous sample", () => {
  let c = cursorReduce({ x: 960, y: 540, lastSample: null }, { state: "Began", x: 0, y: 0 }, 2, B);
  c = cursorReduce(c, { state: "Changed", x: 10, y: -5 }, 2, B);
  expect([c.x, c.y]).toEqual([980, 530]);
  c = cursorReduce(c, { state: "Changed", x: 30, y: -5 }, 2, B); // delta from LAST sample, not origin
  expect([c.x, c.y]).toEqual([1020, 530]);
});

test("clamps to bounds and Ended clears the anchor", () => {
  let c = cursorReduce({ x: 5, y: 5, lastSample: { x: 0, y: 0 } }, { state: "Changed", x: -100, y: -100 }, 2, B);
  expect([c.x, c.y]).toEqual([0, 0]);
  c = cursorReduce(c, { state: "Ended", x: 0, y: 0 }, 2, B);
  expect(c.lastSample).toBeNull();
});

test("two selects within 250ms = double; a lone select fires single on timeout", () => {
  let r = clickReduce({ pendingSince: null }, 1000);
  expect(r.fire).toBeNull();
  expect(r.state.pendingSince).toBe(1000);
  r = clickReduce(r.state, 1180);
  expect(r.fire).toBe("double");
  expect(r.state.pendingSince).toBeNull();
  // and the timeout path is the caller's setTimeout observing pendingSince unchanged
  r = clickReduce({ pendingSince: null }, 2000);
  expect(r.state.pendingSince).toBe(2000);
});
```

Run: `cd apps/tv && npm test` — FAIL (module missing).

- [ ] **Step 2: Implement `cursor-logic.ts`** — the reducers exactly as the tests specify (pan samples are cumulative from gesture start, so deltas are sample-to-sample; gain default 1.6 exported as `CURSOR_GAIN` so Task 18 tunes one constant; `DOUBLE_CLICK_MS = 250` likewise). Run tests — PASS.

- [ ] **Step 3: Implement the hook**

`useRemoteInput.ts`: on `enabled` flips, `TVEventControl.enableTVPanGesture()` / `disableTVPanGesture()`. Subscribe via `useTVEventHandler((ev) => …)`: `ev.eventType === "pan"` → run `cursorReduce`, call `onCursor`; `"select"` → run `clickReduce` against `Date.now()`; when it returns `fire: "double"` cancel the pending timer and call `onDoubleClick(cursor)`, when it starts a pend, arm `setTimeout(DOUBLE_CLICK_MS)` that fires `onSingleClick(cursor)` if still pending; `"up" | "down" | "left" | "right"` → `onDpad` (only while `enabled` — otherwise let the focus engine have them; the fork only routes these to JS when no native focus movement claims them, so ALSO set `focusable={false}`/`isTVSelectable={false}` on everything under the map screen while in cursor mode so nothing competes); `"playPause"` → `onPlayPause`. Menu is untouched (default back behaviour). Cleanup on unmount: disable pan gesture, clear timers.

- [ ] **Step 4: Manual event smoke test**

Temporary debug overlay on a stub screen printing the last event + cursor position; drive with the simulator's remote (Window → Show Apple TV Remote; hold ⌥ to simulate touch-surface finger). Verify: pan moves the number smoothly, select/double-select discriminate, ring arrows arrive as dpad events while enabled, playPause arrives.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "TV: remote input — tested cursor/click reducers + TVEvent hook"
```

---

### Task 12: Hit-testing — cursor point → country

**Files:**
- Create: `packages/core/src/hit-test.ts` (pure — it's core logic usable by any client)
- Test: `packages/core/src/__tests__/hit-test.test.ts`
- Modify: `packages/core/src/index.ts` (barrel)

**Interfaces:**
- Consumes: `resolvePoint` + `TinyBox` (Task 5), `geoContains` from d3-geo, `Country`.
- Produces:

```ts
/** Resolve a projected (unzoomed) point to a country: tiny-box first, then
 *  polygon containment via geoContains on the inverted point, then nearest
 *  projected centroid within maxDistPx. Null in open ocean. */
export function pickCountryAt(
  ptProjected: [number, number], countries: Country[], boxes: TinyBox[],
  projection: GeoProjection, maxDistPx?: number  // default 24
): Country | null;
```

- [ ] **Step 1: Failing tests** — build a fixture with `geoEqualEarth().fitExtent([[0,0],[1920,1080]], {type:"Sphere"})` and three fabricated countries: a large square polygon country, a tiny island with a box, and a polygon-less country (feature: null, centroid only — the "no polygon at 50m" case). Assert: point inside the big polygon → it (via geoContains, NOT nearest-centroid — place another centroid nearer to prove precedence); point in the tiny box → the island even when the box overlaps the big neighbour's polygon (box precedence); point near the polygon-less centroid → it; open-ocean point → null. Run — FAIL.

- [ ] **Step 2: Implement** — order: (1) `resolvePoint` boxes pass; (2) `projection.invert(pt)` → `geoContains(c.feature, lonlat)` over countries with features (guard `invert` returning null/NaN); (3) nearest projected centroid within `maxDistPx`; (4) null. Run — PASS. Barrel-export.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Core: pickCountryAt — box/polygon/centroid cursor resolution"
```

---

### Task 13: The find quiz, playable end to end

**Files:**
- Create: `apps/tv/src/screens/MapQuizScreen.tsx`, `apps/tv/src/components/Scorebar.tsx`, `apps/tv/src/components/HintPanel.tsx`, `apps/tv/src/components/RevealCard.tsx`, `apps/tv/src/components/TvToast.tsx`
- Modify: `apps/tv/src/navigation.tsx` (route already exists; wire params), `apps/tv/App.tsx` (mount TvToast globally)

**Interfaces:**
- Consumes: `useQuizStore` (start/next/handleMapSelect/useHint, `current`, `answered`, `reveal`, `hintLevel`, `session`), `useAtlasStore`, `createTvMapController` + `setMapPort` (Task 10), `useRemoteInput` (Task 11), `pickCountryAt` (Task 12), `useToastStore`, `<TvMap>` (Task 9).
- Produces: the complete map-quiz screen later tasks extend with name-mode choices.

- [ ] **Step 1: Screen assembly**

State: controller (`useMemo(createTvMapController, [])`, registered via `setMapPort` effect per Task 10 Step 3), `cursor` in component state (start centred), map visual state via `ctl.bind`. Input mode derivation — the state machine from the spec, in one place:

```ts
const mode = useQuizStore((s) => s.current?.mode);
const answered = useQuizStore((s) => s.answered);
const cursorMode = mode === "find" && !answered; // CURSOR; everything else FOCUS
```

`useRemoteInput({ enabled: cursorMode, ... })` with:
- `onCursor: setCursor`
- `onSingleClick(c)`: `const hit = pickCountryAt(ctl.screenToProjected(c), DataLayer.countries, boxes, PROJ); if (hit) useQuizStore.getState().handleMapSelect(hit);` (miss = open ocean → no-op; the store handles wrong-country grading, painting, and the arrow through the MapPort — zero quiz logic in the screen)
- `onDoubleClick(c)`: `ctl.zoomToggle(c)`
- `onDpad(dir)`: `ctl.panBy(...)` with `DPAD_PAN_STEP = 160` px (export the constant for Task 18 tuning)
- `onPlayPause()`: `useQuizStore.getState().useHint()`

- [ ] **Step 2: Chrome**

`TvToast`: the stores speak through `toast()` (praise, "Not quite — it's X", pool warnings), so TV needs a renderer for `useToastStore` — a non-focusable animated banner (top-centre, good/bad tinting per the store's kind field, auto-dismiss matching the store's timing) mounted once in `App.tsx` above the navigator; port `apps/web/components/Toast.tsx` behaviour.

`Scorebar` (top): question counter `asked/total`, score, streak, elapsed — read from `session`; serif, parchment on translucent navy. Prompt banner: "Find **{current.item.name}**". `HintPanel` (bottom-left): renders `hintLevel` steps — region → subregion → border-country names (same data web's map page shows; read that page for the exact strings and reuse the copy). `RevealCard` (FOCUS mode overlay once `answered`): correct/incorrect, country + capital line, focusable **Next** button → `next()`, plus **End round** → `quit()` + navigate back. When `session.finished` flips, navigate to Results (stub screen: score + "Back to menu" for now — Task 14 finishes it). While the reveal is up, `cursorMode` is false so the focus engine owns the remote: select activates the focused Next button.

- [ ] **Step 3: Simulator verification checklist**

- Cursor glides smoothly, stays on screen; clicking Brazil on a "Find Brazil" question grades correct (green paint, praise toast-equivalent, score up).
- Wrong click paints red + target painted + arrow marker appears.
- Double-click zooms in at cursor; tiny Caribbean box clickable while zoomed; double-click restores.
- Ring dpad pans while zoomed; map clamps (sphere never lost).
- Play/Pause cycles hint levels 0→3, panel updates, no repeat past 3.
- Reveal card: focus lands on Next automatically (`hasTVPreferredFocus` on it); select advances; round of N finishes to Results.
- Menu button exits to the menu screen (default back), no dead-ends.
- Re-enter the quiz: MapPort re-registers, no stale paints.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "TV: find quiz playable — cursor, zoom toggle, dpad pan, hints"
```

---

# Phase 4 — focus-mode quizzes

### Task 14: Choices grid, name mode, results

**Files:**
- Create: `apps/tv/src/components/ChoicesGrid.tsx`, `apps/tv/src/screens/ResultsScreen.tsx`
- Modify: `apps/tv/src/screens/MapQuizScreen.tsx`

**Interfaces:**
- Consumes: `useQuizStore` (`choices`, `choiceResult`, `eliminatedIds`, `handleChoice`, `useHint`), `Logic.makeChoices` output shape (`Country[]`), `MapPort.frameCountry` (already driven by the store — the screen does nothing for framing).
- Produces: `<ChoicesGrid choices={Country[]} choiceResult={ChoiceResult | null} eliminatedIds={string[]} onChoose(c: Country): void; labelFor?(c: Country): string />` — reused verbatim by Task 15's expert screen.

- [ ] **Step 1: ChoicesGrid**

2×2 grid of focusable `Pressable`s (10-foot version of web's `.choice`/`.choices`): country name label (or `labelFor(c)` when provided), disabled+struck style when `eliminatedIds` contains the id, green/red flash via `choiceResult` (`pickedId`/`correctId`) once answered, `hasTVPreferredFocus` on the first non-eliminated option. Focus scale 1.06 + brass border, parchment card.

- [ ] **Step 2: Name mode on the map screen**

MapQuiz renders `<ChoicesGrid>` in a bottom band when `mode === "name" && choices.length > 0`. Input mode is already FOCUS for name (Task 13's `cursorMode` derivation), so the focus engine drives the grid natively; the store paints the target + frames tiny countries through the MapPort with no screen code. Play/Pause in FOCUS mode: add `useTVEventHandler` on the screen that calls `useHint()` when `ev.eventType === "playPause"` regardless of mode — one hint key everywhere (in name-easy it strikes an option via `eliminatedIds`).

Difficult-mode name questions (`choices` empty) are **deferred to Task 16** — until then MenuScreen simply doesn't offer difficult for map modes (a `TODO(16)` comment marks the gate to remove).

- [ ] **Step 3: ResultsScreen**

Port web `Results.tsx` content to RN: score, correct/total, best streak, duration (`Logic.fmtDuration`), accuracy; buttons **Play again** (navigate back to the quiz screen whose mount `start()`s afresh) and **Menu**. Field Atlas card styling; focus starts on Play again.

- [ ] **Step 4: Simulator verification**

Name-easy round: target painted + framed when tiny, four choices, wrong pick shows red-on-picked/green-on-correct, Play/Pause eliminates one, results screen totals match the round. Regression: find-mode cursor still works when modes = find+name mixed (input mode flips per question).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "TV: choices grid, name mode, results screen"
```

---

### Task 15: Expert quiz — capital + flag

**Files:**
- Create: `apps/tv/src/screens/ExpertQuizScreen.tsx`, `apps/tv/src/components/FlagImage.tsx`
- Modify: `packages/core/src/data-layer.ts` + its test (flag PNG helper)

**Interfaces:**
- Consumes: `useQuizStore` (same session machinery — `screenFor` gives `"quiz"` for these modes and the store runs maplessly), `<ChoicesGrid>` (Task 14), `<Scorebar>`, `<RevealCard>`.
- Produces: `flagPng(c: Country, width?: 320 | 640): string` in core (barrel-exported).

- [ ] **Step 1: Flag URL helper (tested)**

Core change — in `data-layer.ts` add and barrel-export:

```ts
/** flagcdn PNG — RN's Image can't rasterise the SVG endpoints web uses. */
export function flagPng(c: Country, width: 320 | 640 = 640): string {
  return c.cca2 ? `https://flagcdn.com/w${width}/${c.cca2.toLowerCase()}.png` : "";
}
```

Vitest (in `data-layer.test.ts`): maps `cca2: "NZ"` → `https://flagcdn.com/w640/nz.png`; empty string when `cca2` is null. Run core tests — PASS.

- [ ] **Step 2: Screen**

`ExpertQuizScreen`: mount effect `start()` (menu set the modes); prompt card — capital mode: "What's the capital of **{name}**?" with choices labelled via `labelFor: (c) => c.capital`; flag mode: `<FlagImage>` (RN `Image` with `flagPng(current.item)`, fixed 480×320 contain, parchment border, activity indicator while loading) and country-name choices. Reveal + Results reuse Task 13/14 components. Play/Pause = hint (eliminate). Typed difficult mode arrives in Task 16.

- [ ] **Step 3: Simulator verification**

Capital and flag rounds run with the map screen never mounted (proves the portless path on TV proper); flags load over the network (simulator has network; check a few exotic cca2s — e.g. Kosovo has `cca2: XK` on flagcdn); Leitner: answer the same country wrong twice, confirm it resurfaces sooner (check stats/history counts grow in `useAtlasStore`).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "TV: expert quiz — capitals and flags"
```

---

# Phase 5 — typed answers and borders

### Task 16: TypedAnswer — keyboard, dictation, suggestions

**Files:**
- Create: `apps/tv/src/components/TypedAnswer.tsx`
- Create: `packages/core/src/suggest.ts`, `packages/core/src/__tests__/suggest.test.ts`
- Modify: `apps/tv/src/screens/MapQuizScreen.tsx`, `ExpertQuizScreen.tsx`, `MenuScreen.tsx` (remove the difficult-mode gate from Task 14)

**Interfaces:**
- Consumes: `useQuizStore.handleTyped`, `Logic.normalize`, `Logic.levenshtein`, `Logic.revealName`, `Logic.letterCount`, `revealedCount`.
- Produces:
  - Core, tested: `suggest(query: string, pool: Country[], opts?: { limit?: number; capital?: boolean }): Country[]` — prefix matches on `Logic.normalize`d names (or capitals with `capital: true`) first, then levenshtein-nearest fills to `limit` (default 4); empty query → `[]`. (Web's `Autocomplete.tsx` has equivalent ranking inline — lift its comparator so both platforms rank identically, and re-point Autocomplete at core's `suggest` as part of this task.)
  - TV: `<TypedAnswer mode={"name" | "capital"} item={Country} pool={Country[]} revealedCount={number} onSubmit(text: string): void />`.

- [ ] **Step 1: Failing tests for `suggest`** — fixture pool of ~8 countries; assert: `"new z"` prefix-matches New Zealand first; `"zeeland"` still surfaces New Zealand via levenshtein; diacritics fold (`"cote d"` → Côte d'Ivoire) through `Logic.normalize`; `capital: true` ranks by capital (`"welling"` → New Zealand); limit respected; `""` → `[]`. Run — FAIL. Implement. PASS.

- [ ] **Step 2: The component**

Layout (FOCUS mode throughout): an RN `<TextInput>` (on tvOS, focusing + selecting it opens the system full-screen keyboard; **dictation = user holds the Siri button with the keyboard up — zero app code, but put a one-line hint under the field: "Hold ◉ Siri to speak"**), beneath it a row of up to 4 suggestion `Pressable`s from `suggest(text, pool, …)` re-queried on `onChangeText`, submitting on press; a Submit button passing the raw text. Hangman mask when `revealedCount > 0`: `Logic.revealName(answer, revealedCount - 1)` rendered letterboxed above the field (same semantics as web — first hint shows the all-blank mask). Play/Pause hint continues to route to `useHint()` (screen-level handler from Task 14 already does this; it advances `revealedCount` for typed questions via the store).

- [ ] **Step 3: Wire into both screens + unlock the menu**

MapQuiz name-difficult (`mode === "name" && !choices.length`) and Expert difficult both render `<TypedAnswer …onSubmit={(t) => useQuizStore.getState().handleTyped(t)}/>`. Remove Task 14's menu gate.

- [ ] **Step 4: Verification (simulator + device)**

Simulator: keyboard opens, typing "brazl" grades correct for Brazil (matchAnswer fuzziness), suggestions narrow and submit, hangman reveals letter-by-letter. **Real Apple TV:** dictation pass — speak "Kyrgyzstan", "Côte d'Ivoire", "United Arab Emirates"; confirm the dictated string lands in the field and grades; note failures for Task 18 tuning. Also verify the iPhone Remote-app keyboard types into the field.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "TV: typed answers — system keyboard, dictation hint, shared suggest()"
```

---

### Task 17: Borders quiz

**Files:**
- Create: `apps/tv/src/screens/BordersQuizScreen.tsx`, `apps/tv/src/map/TvFrame.tsx`
- Modify: none in core (`borders-store` moved in Task 4; `pickShown`/`expandBounds` already in `Logic`)

**Interfaces:**
- Consumes: `useBordersStore` (`start`, `next`, `setAssign`, `setTyped`, `submit`, `target`, `shown`, `candidates`, `easy`, `assign`, `typed`, `answered`, `reveal`), `Logic.expandBounds`, `geoMercator` + `geoBounds` from d3-geo, `buildCountryPaths`-style Skia rendering (Task 9's `SkiaPathContext`), `<TypedAnswer>`'s suggestion row pattern, `theme`.
- Produces: the complete borders screen.

- [ ] **Step 1: TvFrame**

Static Skia rendering of web's `FrameView`: `geoMercator().fitExtent([[pad,pad],[W-pad,H-pad]], frame)` where `frame` is the target's `Logic.expandBounds(geoBounds(feature), 0.6)` box (mirror `apps/web/components/FrameView.tsx` lines 20–50 — read it and port the exact framing, including how it builds the clip frame polygon). Draw: neighbourhood countries (target `theme.target`-tinted, shown neighbours parchment, others muted), numbered badges at each shown neighbour's projected centroid (Skia `Circle` + `Text` with the bundled serif — Skia text needs a loaded typeface via `useFont`; bundle `apps/tv/assets/fonts/` in Task 18, use system font metrics until then via `matchFont`).

- [ ] **Step 2: Answer UI**

Easy: candidate names as a focusable grid; select a name → then select a badge-number chip 1..N to assign (`setAssign(candidateId, num)`); assigned pairs show inline; Submit → `submit()`. Difficult: N numbered `TypedAnswer`-style rows (`setTyped(num, text)` on change, suggestion row per focused field), one Submit. Reveal: per-badge tick/cross from `reveal.results` (`{ country, num, ok }`), then Next. This mirrors web's borders page one-to-one — the store owns all grading.

- [ ] **Step 3: Simulator verification** — easy round: assign all, submit, mixed verdicts render per badge; difficult round with dictation-shaped sloppy input (typos) still grades via matchAnswer; countries with many neighbours (Russia) cap at the store's shown limit and frame sanely; island-free targets (no neighbours) never appear (store's pool filter guarantees it — verify by running several rounds).

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "TV: borders quiz — static Skia frame, badges, both difficulties"
```

---

# Phase 6 — polish and device tuning

### Task 18: Sound, stats, appearance, hardware pass

**Files:**
- Create: `apps/tv/src/fx-tv.ts`, `apps/tv/src/screens/StatsScreen.tsx`, `apps/tv/assets/fonts/*`, tvOS icon/top-shelf assets in `apps/tv/ios/GeoBeanTV/Images.xcassets`
- Modify: `apps/tv/src/platform-tv.ts` (register FxPort), `apps/tv/src/map/TvFrame.tsx` + text styles (bundled serif), `apps/tv/src/input/cursor-logic.ts` (tuned constants)

**Interfaces:**
- Consumes: `setFxPort`, `useAtlasStore` (`stats`, `history`, `leitner`), `BOX_COLORS`, `Logic.itemWeight`.
- Produces: shipping-quality v1.

- [ ] **Step 1: FxPort implementation** — generate the web app's four cues as small bundled `.caf`/`.wav` files (or synthesise equivalents; web's `fx.ts` documents the tones) and play via `react-native-sound` (verify tvOS pod builds — if it fights, fall back to Expo AV or ship silent; sound is `settings.sound`-gated anyway, matching web). `confetti()` = a lightweight Skia particle burst overlay (or no-op with a comment — taste call). Register in `registerTvPlatform()` behind the setting.

- [ ] **Step 2: StatsScreen** — 10-foot port of `StatsDashboard`'s top strip: answered/correct/accuracy/best streak, Leitner box distribution bars coloured by `BOX_COLORS`, weakest-10 list (highest `Logic.itemWeight`). Focusable Reset-progress button double-confirmed (`resetProgress()`).

- [ ] **Step 3: Typography + icons** — bundle the serif (`apps/web/app/globals.css` names the family; if it's a Google font, download the TTFs) via RN assets + `Info.plist` `UIAppFonts`; apply to headings/prompt/badges. tvOS App Icon (layered image stack) + Top Shelf image in the asset catalog — flat parchment-on-navy globe rendering is fine; Xcode validates the required sizes.

- [ ] **Step 4: Real-hardware tuning pass** (needs the Apple TV + dev-mode pairing; free account = 7-day resign):
  - Cursor: tune `CURSOR_GAIN` until a full touchpad swipe crosses ≈ 2/3 of the screen; check precision on Luxembourg at k=1 vs zoomed.
  - `DOUBLE_CLICK_MS`: fast-clickers shouldn't zoom accidentally when answering twice in a row.
  - `DPAD_PAN_STEP`: holding the ring should feel continuous (if hold generates repeats, keep the step small; if it doesn't, add press-state animation — decide on hardware, note the choice in code).
  - Dictation pass from Task 16 retried on hardware.
  - 1st-gen remote if available: verify swipe-cursor + click still work; ring-pan absent by design.
  - A full session of each family on the couch. Fix what annoys.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "TV: v1 polish — sound, stats, fonts, icons, hardware-tuned input"
```

---

## Final acceptance checklist (v1 done)

- [ ] Web app: unchanged behaviour, deployed, progress preserved (Task 6 gate passed).
- [ ] `npm run typecheck && npm test` green at root (core + web); `cd apps/tv && npm test` green (jest).
- [ ] TV: all three families playable end-to-end in both difficulties; Leitner state persists across relaunches; Menu button never traps; dictation answers a difficult question on hardware.
- [ ] Cursor scheme matches the spec table: glide=cursor, click=select, double-click=zoom toggle, ring=pan, Play/Pause=hint.
- [ ] No `window`/`localStorage`/DOM references in `packages/core` (`npm run typecheck -w @geobean/core` proves it — lib is dom-free).
