import { geoBounds } from "d3-geo";
import {
  DataLayer,
  Logic,
  computeTinyIds,
  layoutTinyBoxes,
  largestPolygonCentroid,
  zoomAt,
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
  panBy(dxPx: number, dyPx: number): void;
  zoomToggle(cursorScreen: { x: number; y: number }): void;
  screenToProjected(pt: { x: number; y: number }): [number, number];
}

/** MapPort implementation for tvOS: drives the same transform/paint/box/arrow
 *  state TvMap renders, over Skia instead of D3/SVG. Pan/zoom are plain
 *  translate+scale on a Skia group, so the pure algebra lives in
 *  @geobean/core's map-transform (tested there) — this controller just wires
 *  it to dpad/cursor input and notifies subscribers. */
export function createTvMapController(): TvMapController {
  const tinyIds = computeTinyIds(DataLayer.countries);
  const boxes = layoutTinyBoxes(DataLayer.countries, tinyIds, PROJ);

  let transform: MapTransform = { ...IDENTITY };
  let paints = new Map<string, PaintKind>();
  let savedTransform: MapTransform | null = null;
  let arrow: TvMapState["arrow"] = null;
  let flashTimer: ReturnType<typeof setTimeout> | null = null;

  const listeners = new Set<(s: TvMapState) => void>();
  function notify() {
    const s: TvMapState = { transform, paints, boxes, arrow };
    for (const l of listeners) l(s);
  }

  // Keep at least a sliver of the sphere on screen at any pan offset, so the
  // player can never scroll the whole map away into empty space. Approximates
  // the sphere's projected bounds via PROJ's own fitExtent box (0,0)-(1920,1080)
  // at k=1, scaled by the current k.
  function clampPan(t: MapTransform): MapTransform {
    const margin = 200; // px of the map that must stay visible
    const minTx = VIEWPORT.w - VIEWPORT.w * t.k - margin;
    const maxTx = margin;
    const minTy = VIEWPORT.h - VIEWPORT.h * t.k - margin;
    const maxTy = margin;
    return {
      k: t.k,
      tx: Math.max(minTx, Math.min(maxTx, t.tx)),
      ty: Math.max(minTy, Math.min(maxTy, t.ty)),
    };
  }

  return {
    isReady() {
      return true;
    },
    get tinyIds() {
      return tinyIds;
    },

    paint(id, kind) {
      paints.set(id, kind);
      notify();
    },
    clearHighlights() {
      paints = new Map();
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
      const [[w, s], [e, n]] = Logic.expandBounds(geoBox, pad);
      // Project all four corners (not just two diagonal ones) — geoEqualEarth
      // isn't a rectilinear projection, so the padded lon/lat box's projected
      // extent isn't just the projection of its two corners.
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
      if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1)) return;
      const maxK = tinyIds.has(c.id) ? 7 : MAXK;
      transform = fitBounds([[x0, y0], [x1, y1]], VIEWPORT, 1.4, maxK);
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
      paints.set(id, "sel");
      notify();
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => {
        flashTimer = null;
        paints.delete(id);
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
    panBy(dxPx, dyPx) {
      transform = clampPan({ ...transform, tx: transform.tx + dxPx, ty: transform.ty + dyPx });
      notify();
    },
    zoomToggle(cursorScreen) {
      if (savedTransform) {
        transform = savedTransform;
        savedTransform = null;
      } else {
        savedTransform = transform;
        transform = zoomAt(transform, cursorScreen, 3, MAXK);
      }
      notify();
    },
    screenToProjected({ x, y }) {
      const { k, tx, ty } = transform;
      return [(x - tx) / k, (y - ty) / k];
    },
  };
}
