import { geoBounds } from "d3-geo";
import {
  DataLayer,
  Logic,
  computeTinyIds,
  layoutTinyBoxes,
  largestPolygonCentroid,
  fitBounds,
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

export interface TvMapState {
  transform: MapTransform;
  paints: Map<string, PaintKind>;
  boxes: TinyBox[];
  arrow: { x: number; y: number; angle: number } | null;
}

export interface TvMapController extends MapPort {
  /** Subscribe the React component; called with every visual state change. */
  bind(onChange: (s: TvMapState) => void): () => void;
  /** Replace the whole paint map in one notify — used by dpad find navigation,
   *  which repaints region groups / the current country on every move. */
  setHighlights(paints: Map<string, PaintKind>): void;
  /** Zoom to fit every country of a nav-region (dpad find, region → country). */
  frameRegion(members: Country[]): void;
}

/** MapPort implementation for tvOS: drives the same transform/paint/box/arrow
 *  state TvMap renders, over Skia instead of D3/SVG. Zoom/frame are plain
 *  translate+scale on a Skia group, so the pure algebra lives in
 *  @geobean/core's map-transform (tested there) — this controller just wires
 *  it to dpad input and notifies subscribers.
 *
 *  Every paint mutator installs a NEW Map reference (never mutates in place):
 *  TvMap is `memo`'d on `paints` by reference, so a fresh Map is what makes it
 *  actually repaint when a highlight changes mid-question (e.g. the confirm
 *  paint after a run of setHighlights moves). */
export function createTvMapController(): TvMapController {
  const tinyIds = computeTinyIds(DataLayer.countries);
  const boxes = layoutTinyBoxes(DataLayer.countries, tinyIds, PROJ);

  let transform: MapTransform = { ...IDENTITY };
  let paints = new Map<string, PaintKind>();
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
    frameRegion(members: Country[]) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const c of members) {
        if (!c.feature) continue;
        const px = projectBox(geoBounds(c.feature as never) as [[number, number], [number, number]]);
        if (!px) continue;
        x0 = Math.min(x0, px[0][0]);
        y0 = Math.min(y0, px[0][1]);
        x1 = Math.max(x1, px[1][0]);
        y1 = Math.max(y1, px[1][1]);
      }
      if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1)) return;
      // A little breathing room around the region, then fit — cap the zoom so a
      // compact region (e.g. Europe) still shows with surrounding context.
      const padX = (x1 - x0) * 0.08;
      const padY = (y1 - y0) * 0.08;
      transform = fitBounds([[x0 - padX, y0 - padY], [x1 + padX, y1 + padY]], VIEWPORT, 1, 6);
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

    bind(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}
