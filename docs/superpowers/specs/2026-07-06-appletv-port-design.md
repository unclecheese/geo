# GeoBean for Apple TV — Design

**Date:** 2026-07-06
**Status:** Approved (brainstorm 2026-07-06)

## Summary

Port GeoBean to a native Apple TV app using **react-native-tvos**, restructuring the
repo into a **monorepo with a shared core package** so the web app and the TV app run
the same quiz logic, Leitner scheduler, stores, and data layer. v1 ships **Map (find +
name), Expert (capital + flag), and Borders**; Build is out of scope. Distribution is
**personal Xcode sideload**; progress is **local-only per device**.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Tech stack | react-native-tvos (community RN fork; WKWebView does not exist on tvOS, so wrapping the web app is impossible) |
| v1 scope | Map find + name, Expert capital + flag, Borders. No Build. |
| Repo layout | Monorepo: `packages/core` + `apps/web` + `apps/tv` (npm workspaces) |
| Zoom model | Double-click toggle: in one step centred on cursor ↔ back out to session view |
| Typed answers | tvOS system full-screen keyboard; voice = system dictation into the text field (hold Siri button); focusable autocomplete suggestions alongside |
| Remote baseline | 2nd-gen+ Siri Remote (2021+, clickable ring). 1st-gen degrades gracefully: no ring-panning |
| Distribution | Personal sideload via Xcode |
| Progress | Local-only (AsyncStorage on TV, localStorage on web); no sync |

## Platform constraints (verified 2026-07-06)

- **No microphone access for third-party tvOS apps**; `SFSpeechRecognizer` is
  unavailable. Custom speech capture is impossible. The only voice path is the system
  keyboard's built-in dictation while a text field is focused. The iPhone Remote-app
  keyboard works automatically.
- **No WKWebView on tvOS** — the existing Next.js app cannot be embedded.
- **react-native-tvos** is actively maintained (releases track RN core, e.g. 0.81.x-y).
  `TVEventControl.enableTVPanGesture()` emits continuous `pan` events
  (`{state: Began|Changed|Ended, x, y, velocityx, velocityy}`) from the Siri Remote
  touch surface — the cursor's input source.
- **@shopify/react-native-skia supports tvOS** (≥ 1.9.0) under react-native-tvos; the
  react-native-tvos org publishes a working `SkiaMultiplatform` sample. Caveat: "not
  all features tested on TV" — treated as a named risk below.
- **Menu/Back is reserved by Apple HIG**: it must navigate back / exit; it cannot be a
  quiz control.

## Architecture

### Monorepo

```
geo/
  packages/core/    # @geobean/core — platform-free
    logic, types, constants, modes, data-layer, ru-fix, placement
    stores: atlas, quiz, borders, toast
  apps/web/         # the existing Next.js app, moved
  apps/tv/          # react-native-tvos app, new
```

Web-only modules stay in `apps/web`: `map-view.ts`, `build-view.ts`, `fx.ts`,
`build-graph.ts`, `build-store.ts`, `og.tsx`, hooks, and all React components.
Moving the web app changes the Vercel project root — the Vercel setting must be
updated as part of the refactor phase.

### Core seams (the refactor)

`@geobean/core` must not touch browser or RN globals. Three seams are cut, each an
injected port with a platform adapter:

1. **`KVStorage`** — `{ get(key): Promise<string|null>, set(key, value): Promise<void>, remove(key): Promise<void> }` (async-first so AsyncStorage and localStorage share one interface).
   Consumed by `data-layer.ts` (dataset cache, currently `localStorage` at lines
   198/209) and `atlas-store.ts` (custom persist adapter, lines 65–90). Web adapter =
   localStorage (sync); TV adapter = AsyncStorage (async). The core code paths must
   tolerate async storage — data-layer already loads inside an async gate; the atlas
   persist adapter follows zustand's `createJSONStorage` async support.
2. **`MapPort`** — the interface `quiz-store` currently reaches via
   `import("@/lib/map-view")` (10 call sites). Surface (from usage audit):
   `isReady(): boolean` (replaces `_inited` guard), `clearHighlights()`,
   `flashSelect(...)`, `frameCountry(c, pad)`, `markArrow(c)`, `paint(id, kind)`,
   `refreshColors()`, `reset()`, `tinyIds: Set<string>`. Core holds a registered
   implementation (`setMapPort(impl)`); calls no-op safely when none is registered
   (expert/borders modes run mapless). Web registers `MapView`; TV registers its Skia
   map controller.
3. **`FxPort`** — `quiz-store` and `borders-store` import `Audio2`/`Confetti` from
   `lib/fx` (WebAudio + canvas; web-only). Port surface: `hint()`, `correct()`,
   `wrong()`, `milestone()`, `confetti()`. Web adapter wraps `fx.ts`; TV adapter is
   no-op in v1 (sound is a polish-phase item).

`toast-store` is pure zustand and moves to core unchanged. The refactor phase ends
with the web app deployed and regression-verified before any TV code is written.

## TV app design

### Skeleton

react-native-tvos + TypeScript + react-navigation. Screens mirror web routes:
**Menu** (session setup) → **MapQuiz** / **ExpertQuiz** / **BordersQuiz** →
**Results**; plus **Stats**. Dataset loading reuses `DataLayer` verbatim (RN `fetch`,
same jsdelivr URLs, AsyncStorage cache, same loading gate as `DataProvider`).

### Input model: explicit two-mode state machine

tvOS is normally focus-driven; the cursor is pointer-driven (how tvOS games work).
The app holds an explicit `InputMode` and never mixes them:

- **FOCUS mode** — everything except find-the-country: menus, multiple-choice grids,
  borders, results, keyboard. Standard tvOS focus engine via the RN fork
  (`Pressable`, `TVFocusGuideView`). No custom input code.
- **CURSOR mode** — only on the map during a *find* question.
  `TVEventControl.enableTVPanGesture()` on; focus trapped on the map surface;
  disabled the moment any overlay appears.

*Name* questions auto-frame the target country (as on web) and answer in FOCUS mode.
Only *find* uses the cursor — the custom-input surface is deliberately minimal.

### Control mapping (CURSOR mode)

| Input | Action |
|---|---|
| Glide finger on touchpad | Move cursor — pan events integrate as velocity-scaled deltas (relative, trackpad-style), clamped to screen |
| Click touchpad (select) | Select country under cursor = answer attempt |
| Double-click | Zoom toggle: in one step centred on cursor ↔ back to session view (~250 ms debounce; single-click fires on timeout) |
| Ring dpad press/hold | Pan map continuously (consume `up/down/left/right` TVEvents; they must not reach the focus engine) |
| Play/Pause | Free hint (region → subregion → border countries) |
| Menu/Back | Reserved: pause/exit quiz (HIG) |
| Siri button hold (text field up) | System dictation (FOCUS mode, difficult answers) |

1st-gen remote: everything works except ring-panning. Cursor feel (velocity scaling,
debounce) is tuned on real hardware; the simulator's touch surface is only a smoke
test.

### Hit-testing

Cursor selection: `projection.invert(cursorXY)` → `d3.geoContains(feature, lonlat)`,
with the existing tiny-island logic (point-in-box, then nearest-centroid) layered on
top. Independent of rendered paths. The tiny-island box computation moves to core.

### Map rendering

`@shopify/react-native-skia`. `d3-geo` is DOM-free: `geoPath(projection, ctx)`
accepts any context implementing `moveTo/lineTo/arc/closePath` — country features
render into Skia `Path` objects built once per session. Pan/zoom is a Skia group
transform over prebuilt paths (same transform-not-reproject strategy as the web app);
highlights recolour individual paths; the cursor is a crosshair in a top layer.
Tiny-island outline boxes reuse the core computation. Theme: Field Atlas palette as a
constants module; serif font bundled.

### Answers

- **Easy** — `makeChoices` distractors as a 2×2 focusable grid (10-foot re-skin of
  `Choices`). Pure FOCUS mode.
- **Difficult** — RN `TextInput` opens the tvOS full-screen keyboard; voice = system
  dictation. The `normalize`/`levenshtein`/`matchAnswer` pipeline absorbs dictation
  quirks. Live autocomplete suggestions render as focusable buttons.
- **Borders** — static Skia frame of the neighbourhood (reusing `FrameView`'s framing
  math) + the difficult-mode input loop (or matching grid on easy).
- **Flags** — flagcdn **PNG** endpoints (`https://flagcdn.com/w640/{cca2}.png`); RN
  `Image` does not render SVG.

### Persistence

`atlas-store` persists to AsyncStorage under the same versioned shape
(`STATE_VERSION` / `migrateState` shared from core).

## Testing & verification

- Core keeps its vitest suite; the port refactor adds tests (stores become testable
  without dynamic-import mocking).
- TV app: Apple TV simulator for flows; real device (Xcode sideload) for cursor
  tuning and dictation, which the simulator cannot exercise.
- Web app: full regression (build + tests + browser pass + deploy) at the end of the
  refactor phase.

## Build phases (each independently shippable)

0. **Monorepo refactor** — workspaces, `@geobean/core`, the three ports, Vercel root
   update, web regression-verified.
1. **TV scaffold** — app boots in simulator, loads dataset, menu navigates.
2. **Map renders** — Skia map, theme, pan/zoom transforms, tiny-island boxes.
3. **Cursor + controls** — full CURSOR-mode mapping, hit-testing; find playable
   end-to-end.
4. **Focus-mode quizzes** — name (framed + choices), expert capital/flag, hints,
   results, Leitner recording.
5. **Difficult mode + borders** — keyboard, dictation, suggestions, borders quiz.
6. **Polish + device tuning** — sounds, stats, cursor feel on hardware, icon/top-shelf.

## Risks

- **Skia-on-tvOS maturity** — "supported, not fully battle-tested". Mitigation:
  phase 2 is early and small; fallback is `react-native-svg` before anything builds
  on top.
- **Pan-event ergonomics** — relative-delta feel, drift. Mitigation: budgeted device
  tuning; escape hatch is a small native module reading `GCMicroGamepad`
  (`reportsAbsoluteDpadValues` gives absolute finger position).
- **Dictation quality on country names** — untestable in simulator. Hedge: fuzzy
  matcher + visible suggestions.
- **Monorepo/Metro friction** — Metro needs `watchFolders`/`nodeModulesPaths` for
  workspace packages; Vercel root directory changes. Both are named tasks, not
  surprises.

## Out of scope (v1)

Build mode, game-controller support, progress sync (any flavour), App Store /
TestFlight distribution, Android TV (kept possible by the RN choice, not targeted).
