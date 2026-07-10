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
// along the top and the QuizCard bar flush to the bottom. Find framing fits
// regions into this rect, and pan-follow keeps the current country inside it, so
// nothing the player is looking at ever hides behind the chrome. The bottom
// inset tracks the compact find-mode bar's height (progress + two rows +
// padding ≈ 180) plus a small margin — an expanded find hint-list or the
// name-mode choices/typed grid can still grow the bar past it, but those are
// opt-in / name-only (find is the mode that frames regions).
const SAFE = { top: 140, bottom: 220, left: 90, right: 90 };
const safeRect = () => ({
  x0: SAFE.left,
  y0: SAFE.top,
  x1: VIEWPORT.w - SAFE.right,
  y1: VIEWPORT.h - SAFE.bottom,
});

// Region framing pads the member-centroid bounding box: a fraction of its span,
// but at least REGION_MIN_PAD px a side so a tight or single-member cluster gets
// context rather than a maxK slam on a point. MAXFRAME caps the region zoom.
const REGION_PAD_FRAC = 0.2;
const REGION_MIN_PAD = 220;
const MAXFRAME = 6;

// Per-country navigation follow (frameCountryInSafe): expand the country's own
// bounds so a margin of context / ~1–2 neighbours show (same pad semantics as
// frameCountry's 0.4 — higher = more context, and less scale change per move),
// then fit into the safe band clamped to [MINK, MAXK]. MINK keeps a large
// country still reading as "zoomed in"; MAXK stops a tiny country/island zooming
// absurdly far. TORN_DEG is the half-size (degrees) of the fallback box used for
// an antimeridian-crossing country, whose geoBounds would otherwise be torn.
const COUNTRY_CONTEXT_PAD = 1.4;
const COUNTRY_MINK = 1.6;
const COUNTRY_MAXK = 9;
const TORN_DEG = 14;

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
  /** Zoom to fit every country of a nav-region into the HUD-safe band — the
   *  orientation overview shown on region-select (dpad find, region → country). */
  frameRegion(members: Country[]): void;
  /** Zoom+pan the camera onto one country (with a margin of context so ~1–2
   *  neighbours show), fit into the HUD-safe band. This is the per-country
   *  navigation follow: it leans in on small countries so they're readable and
   *  eases back out on large ones. */
  frameCountryInSafe(c: Country): void;
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
      // Frame to the bounding box of member CENTROIDS, not their geoBounds boxes.
      // Many countries sprawl far past their populated mass (France→French
      // Guiana, Norway→Svalbard, Canada→Arctic islands), which would blow the
      // union box up to a third of the globe and leave the frame at world view.
      // A largest-polygon centroid is one point on the main mass, so the frame
      // stays tight; padding + the per-country zoom-follow give each body room. (A
      // centroid can't tear at the antimeridian, so no torn-member special case
      // is needed — but dominantCluster still drops Oceania's trans-dateline
      // minority.)
      const pts: [number, number][] = [];
      const xs: number[] = [];
      for (const c of members) {
        if (!c.feature) continue;
        const p = PROJ(largestPolygonCentroid(c.feature));
        if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
        pts.push([p[0], p[1]]);
        xs.push(p[0]);
      }
      if (!pts.length) return;

      // Drop a trans-dateline minority (Oceania: Polynesia at the far left vs.
      // the Australasian mass at the right) so we frame the dominant cluster;
      // the per-country zoom-follow reaches the stragglers. Compact regions keep
      // every member.
      const keep = dominantCluster(xs, 0.3 * VIEWPORT.w);

      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < pts.length; i++) {
        if (!keep[i]) continue;
        x0 = Math.min(x0, pts[i][0]);
        y0 = Math.min(y0, pts[i][1]);
        x1 = Math.max(x1, pts[i][0]);
        y1 = Math.max(y1, pts[i][1]);
      }
      if (!isFinite(x0) || !isFinite(y0) || !isFinite(x1) || !isFinite(y1)) return;

      // Pad each side so a country whose centroid sits at the box edge still
      // shows its body: a fraction of the span, but at least REGION_MIN_PAD px
      // a side so a tight cluster or single-member region gets context instead
      // of slamming to maxK on a point. Then fit into the HUD-safe band.
      const padX = Math.max((x1 - x0) * REGION_PAD_FRAC, REGION_MIN_PAD);
      const padY = Math.max((y1 - y0) * REGION_PAD_FRAC, REGION_MIN_PAD);
      transform = fitInto([[x0 - padX, y0 - padY], [x1 + padX, y1 + padY]], safeRect(), 1, MAXFRAME);
      notify();
    },
    frameCountryInSafe(c: Country) {
      if (!c.feature) return;
      const gb = geoBounds(c.feature as never) as [[number, number], [number, number]];
      let px: [[number, number], [number, number]] | null;
      if (gb[0][0] > gb[1][0]) {
        // Antimeridian-crossing (Russia, USA/Alaska): geoBounds is torn into a
        // full-width box. Frame a fixed degree box around the largest-polygon
        // centroid instead so the zoom stays sane.
        const [lng, lat] = largestPolygonCentroid(c.feature);
        px = projectBox([[lng - TORN_DEG, lat - TORN_DEG], [lng + TORN_DEG, lat + TORN_DEG]]);
      } else {
        px = projectBox(Logic.expandBounds(gb, COUNTRY_CONTEXT_PAD));
      }
      if (!px) return;
      transform = fitInto(px, safeRect(), COUNTRY_MINK, COUNTRY_MAXK);
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
