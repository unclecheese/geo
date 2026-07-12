import { geoBounds } from "d3-geo";
import {
  DataLayer,
  Logic,
  computeTinyIds,
  layoutTinyBoxes,
  largestPolygonCentroid,
  fitBounds,
  zoomAt,
  type Country,
  type MapPort,
  type MapTransform,
  type TinyBox,
} from "@geobean/core";
import { PROJ, type PaintKind } from "./TvMap";

const VIEWPORT = { w: 1920, h: 1080 };
const MAXK = 8;
const IDENTITY: MapTransform = { k: 1, tx: 0, ty: 0 };

// Straight down, same convention as the web arrow glyph (it always points at
// the ground beneath its tip regardless of the target's position).
const ARROW_ANGLE = 0;

// Double-tap Select zoom-in factor — the TV analogue of the web map's
// dblclick-to-zoom-and-centre. One tap in, one tap back out (zoomToggle).
const ZOOM_FACTOR = 3;

export interface TvMapState {
  transform: MapTransform;
  paints: Map<string, PaintKind>;
  boxes: TinyBox[];
  arrow: { x: number; y: number; angle: number } | null;
}

export interface TvMapController extends MapPort {
  /** Subscribe the React component; called with every visual state change. */
  bind(onChange: (s: TvMapState) => void): () => void;
  /** Replace the whole paint map in one notify — used for the cursor's hover
   *  highlight, repainted only when the hovered country changes. */
  setHighlights(paints: Map<string, PaintKind>): void;
  /** Double-tap Select: zoom in centred on the cursor point (keeping that point
   *  fixed under the cursor), or — if already double-tap-zoomed — restore the
   *  pre-zoom view. The TV stand-in for web's scroll-wheel zoom-out. */
  zoomToggle(cursorScreen: { x: number; y: number }): void;
  /** Cursor screen px → projected (unzoomed) map px, so pickCountryAt (which
   *  works in projection space) resolves what's under the cursor at any zoom. */
  screenToProjected(pt: { x: number; y: number }): [number, number];
}

/** MapPort implementation for tvOS: drives the same transform/paint/box/arrow
 *  state TvMap renders, over Skia instead of D3/SVG. Zoom/frame are plain
 *  translate+scale on a Skia group, so the pure algebra lives in
 *  @geobean/core's map-transform (tested there) — this controller just wires
 *  it to the floating-cursor input and notifies subscribers.
 *
 *  Every paint mutator installs a NEW Map reference (never mutates in place):
 *  TvMap is `memo`'d on `paints` by reference, so a fresh Map is what makes it
 *  actually repaint when the hovered country changes or the answer paints land. */
export function createTvMapController(): TvMapController {
  const tinyIds = computeTinyIds(DataLayer.countries);
  const boxes = layoutTinyBoxes(DataLayer.countries, tinyIds, PROJ);

  let transform: MapTransform = { ...IDENTITY };
  let paints = new Map<string, PaintKind>();
  // The pre-zoom transform, stashed on double-tap zoom-in so the next double-tap
  // restores it exactly. Null ⇒ not currently double-tap-zoomed.
  let savedTransform: MapTransform | null = null;
  let arrow: TvMapState["arrow"] = null;
  let flashTimer: ReturnType<typeof setTimeout> | null = null;

  const listeners = new Set<(s: TvMapState) => void>();
  function notify() {
    const s: TvMapState = { transform, paints, boxes, arrow };
    for (const l of listeners) l(s);
  }

  // Project the padded lon/lat box's four corners (geoEqualEarth isn't
  // rectilinear, so two diagonal corners under-cover it) into a screen-px box.
  function projectBox(
    box: [[number, number], [number, number]]
  ): [[number, number], [number, number]] | null {
    const [[w, s], [e, n]] = box;
    const corners: [number, number][] = [
      [w, s],
      [w, n],
      [e, s],
      [e, n],
    ];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const corner of corners) {
      const p = PROJ(corner);
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }
    if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1)) return null;
    return [[x0, y0], [x1, y1]];
  }

  return {
    isReady() {
      return true;
    },
    get tinyIds() {
      return tinyIds;
    },

    paint(id, kind) {
      paints = new Map(paints).set(id, kind);
      notify();
    },
    clearHighlights() {
      paints = new Map();
      arrow = null;
      notify();
    },
    setHighlights(next) {
      paints = new Map(next);
      arrow = null;
      notify();
    },
    reset() {
      transform = { ...IDENTITY };
      savedTransform = null;
      notify();
    },
    frameCountry(c: Country, pad = 0.4) {
      if (!c.feature) return;
      const geoBox = geoBounds(c.feature as never) as [[number, number], [number, number]];
      const px = projectBox(Logic.expandBounds(geoBox, pad));
      if (!px) return;
      const maxK = tinyIds.has(c.id) ? 7 : MAXK;
      transform = fitBounds(px, VIEWPORT, 1.4, maxK);
      notify();
    },
    markArrow(c: Country) {
      if (!c.feature) return;
      const centroid = largestPolygonCentroid(c.feature);
      const p = PROJ(centroid);
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) return;
      arrow = { x: p[0], y: p[1], angle: ARROW_ANGLE };
      notify();
    },
    flashSelect(id: string) {
      paints = new Map(paints).set(id, "sel");
      notify();
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flashTimer = null;
        const next = new Map(paints);
        next.delete(id);
        paints = next;
        notify();
      }, 600);
    },
    refreshColors() {
      // Heatmap (mastery-driven country colouring) is out of scope for TV v1.
    },

    zoomToggle(cursorScreen) {
      if (savedTransform) {
        transform = savedTransform;
        savedTransform = null;
      } else {
        savedTransform = transform;
        transform = zoomAt(transform, cursorScreen, ZOOM_FACTOR, MAXK);
      }
      notify();
    },
    screenToProjected({ x, y }) {
      const { k, tx, ty } = transform;
      return [(x - tx) / k, (y - ty) / k];
    },

    bind(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}
