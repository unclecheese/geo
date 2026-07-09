import { geoBounds } from "d3-geo";
import {
  DataLayer,
  Logic,
  computeTinyIds,
  layoutTinyBoxes,
  largestPolygonCentroid,
  fitBounds,
  dominantCluster,
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

// The band of the 1920×1080 map NOT covered by HUD chrome: the Scorebar strip
// along the top and the QuizCard overlay anchored to the bottom. Find framing
// fits regions into this rect, and pan-follow keeps the current country inside
// it, so nothing the player is looking at ever hides behind the chrome. The
// bottom inset tracks the card's default (no-hints) height — expanding hints
// grow it further, but those are opt-in and carry their own text.
const SAFE = { top: 140, bottom: 400, left: 90, right: 90 };
const safeRect = () => ({
  x0: SAFE.left,
  y0: SAFE.top,
  x1: VIEWPORT.w - SAFE.right,
  y1: VIEWPORT.h - SAFE.bottom,
});

// A country's projected centroid must sit at least this far inside the safe rect
// before pan-follow leaves it alone — the slack absorbs the country's own extent
// so its body, not just its centroid, stays clear of the edges.
const COMFORT_MARGIN = 120;

type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Like core's fitBounds but centres the box inside an arbitrary sub-rect of the
 *  viewport (not the whole viewport) — so a region lands in the clear band
 *  between the scorebar and the card. */
function fitInto(
  px: [[number, number], [number, number]],
  rect: Rect,
  minK: number,
  maxK: number
): MapTransform {
  const [[x0, y0], [x1, y1]] = px;
  const boxW = x1 - x0;
  const boxH = y1 - y0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rw = rect.x1 - rect.x0;
  const rh = rect.y1 - rect.y0;
  let k = Math.min(rw / boxW, rh / boxH);
  if (!isFinite(k)) k = maxK;
  k = Math.max(minK, Math.min(k, maxK));
  const rcx = (rect.x0 + rect.x1) / 2;
  const rcy = (rect.y0 + rect.y1) / 2;
  return { k, tx: rcx - cx * k, ty: rcy - cy * k };
}

/** Keep at least `margin` px of the projected sphere on screen at any pan
 *  offset, so pan-follow can never scroll the whole map away. */
function clampPan(t: MapTransform): MapTransform {
  const margin = 200;
  const minTx = VIEWPORT.w - VIEWPORT.w * t.k - margin;
  const minTy = VIEWPORT.h - VIEWPORT.h * t.k - margin;
  return {
    k: t.k,
    tx: Math.max(minTx, Math.min(margin, t.tx)),
    ty: Math.max(minTy, Math.min(margin, t.ty)),
  };
}

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
  /** Zoom to fit every country of a nav-region (dpad find, region → country)
   *  into the HUD-safe band. */
  frameRegion(members: Country[]): void;
  /** Edge-triggered pan-follow: if `c`'s projected centroid is near/outside the
   *  safe rect, pan (k unchanged) just enough to bring it comfortably inside;
   *  otherwise do nothing. Keeps navigation toward a region's edge from walking
   *  the highlight under the scorebar/card. */
  ensureVisible(c: Country): void;
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
      // Per-member: a projected box and a representative centroid screen-x.
      // A member whose geoBounds crosses the antimeridian (west λ > east λ) is
      // torn by the 0°-centred projection into a full-width box, so contribute
      // its largest-polygon centroid as a zero-size point instead — that keeps
      // Russia (eastAsia) and Alaska/USA (northAmerica) in the mainland mass.
      const memberBoxes: [[number, number], [number, number]][] = [];
      const centroidXs: number[] = [];
      for (const c of members) {
        if (!c.feature) continue;
        const gb = geoBounds(c.feature as never) as [[number, number], [number, number]];
        const cp = PROJ(largestPolygonCentroid(c.feature));
        if (!cp || !isFinite(cp[0]) || !isFinite(cp[1])) continue;
        const torn = gb[0][0] > gb[1][0];
        const box = torn ? ([[cp[0], cp[1]], [cp[0], cp[1]]] as [[number, number], [number, number]]) : projectBox(gb);
        if (!box) continue;
        memberBoxes.push(box);
        centroidXs.push(cp[0]);
      }
      if (!memberBoxes.length) return;

      // Drop a trans-dateline minority (Oceania: Polynesia at the far left vs.
      // the Australasian mass at the right) so we frame the dominant cluster;
      // pan-follow reaches the stragglers. Compact regions keep every member.
      const keep = dominantCluster(centroidXs, 0.3 * VIEWPORT.w);

      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < memberBoxes.length; i++) {
        if (!keep[i]) continue;
        x0 = Math.min(x0, memberBoxes[i][0][0]);
        y0 = Math.min(y0, memberBoxes[i][0][1]);
        x1 = Math.max(x1, memberBoxes[i][1][0]);
        y1 = Math.max(y1, memberBoxes[i][1][1]);
      }
      if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1)) return;
      // A little breathing room around the region, then fit into the HUD-safe
      // band (not the full viewport) — cap the zoom so a compact region still
      // shows with surrounding context. A region too big to fit even at k=1
      // overflows the band; pan-follow (ensureVisible) covers navigating it.
      const padX = (x1 - x0) * 0.08;
      const padY = (y1 - y0) * 0.08;
      transform = fitInto([[x0 - padX, y0 - padY], [x1 + padX, y1 + padY]], safeRect(), 1, 6);
      notify();
    },
    ensureVisible(c: Country) {
      if (!c.feature) return;
      const centroid = largestPolygonCentroid(c.feature);
      const w = PROJ(centroid);
      if (!w || !isFinite(w[0]) || !isFinite(w[1])) return;
      const sx = w[0] * transform.k + transform.tx;
      const sy = w[1] * transform.k + transform.ty;
      const r = safeRect();
      const m = COMFORT_MARGIN;
      let dx = 0;
      let dy = 0;
      if (sx < r.x0 + m) dx = r.x0 + m - sx;
      else if (sx > r.x1 - m) dx = r.x1 - m - sx;
      if (sy < r.y0 + m) dy = r.y0 + m - sy;
      else if (sy > r.y1 - m) dy = r.y1 - m - sy;
      // Edge-triggered: already comfortably inside → don't move (no jitter).
      if (dx === 0 && dy === 0) return;
      transform = clampPan({ k: transform.k, tx: transform.tx + dx, ty: transform.ty + dy });
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
