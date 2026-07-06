export type Point = [number, number];
export type Ring = Point[];
export type Poly = Ring[]; // a polygon as an array of rings (outer + holes)

export interface ValidateOpts {
  // Piece outline at its TRUE (correct) position, in pixels.
  pieceRings: Poly;
  // How far the dropped piece is translated from its true spot: drop − true.
  offset: Point;
  // Fraction of the piece that must overlap its true footprint to count (0–1).
  requiredOverlap: number;
  // A near-exact drop within this many pixels always counts (sampling slack).
  minAbsTol: number;
}

export interface Verdict {
  ok: boolean;
  fraction: number;
}

/**
 * Pure screen-space geometry for the build drag layer. Decides whether a
 * dropped piece snaps, given the piece's projected polygon, the placed
 * neighbours' polygons, and the two margins. All coordinates are pixels.
 */
export const Placement = {
  _dist(a: Point, b: Point): number {
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
  },

  // Distance from point p to segment a-b.
  _ptSeg(p: Point, a: Point, b: Point): number {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const wx = p[0] - a[0], wy = p[1] - a[1];
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(p[0] - b[0], p[1] - b[1]);
    const t = c1 / c2;
    return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
  },

  // Proper crossing test for segments a-b and c-d.
  _segCross(a: Point, b: Point, c: Point, d: Point): boolean {
    const o = (p: Point, q: Point, r: Point) =>
      (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
    return (
      ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    );
  },

  // Minimum distance between two segments (0 if they cross).
  _segSeg(a: Point, b: Point, c: Point, d: Point): number {
    if (this._segCross(a, b, c, d)) return 0;
    return Math.min(
      this._ptSeg(a, c, d),
      this._ptSeg(b, c, d),
      this._ptSeg(c, a, b),
      this._ptSeg(d, a, b)
    );
  },

  // Even-odd point-in-ring test (ring may be open or closed).
  _ptInRing(p: Point, ring: Ring): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if (
        yi > p[1] !== yj > p[1] &&
        p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi
      )
        inside = !inside;
    }
    return inside;
  },

  // Even-odd point-in-polygon across all rings (outer ring + holes).
  _ptInPoly(p: Point, poly: Poly): boolean {
    let inside = false;
    for (const ring of poly) if (this._ptInRing(p, ring)) inside = !inside;
    return inside;
  },

  // Bounding box [minX, minY, maxX, maxY] of a polygon's rings.
  _bbox(poly: Poly): [number, number, number, number] {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const ring of poly) for (const [x, y] of ring) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
    return [x0, y0, x1, y1];
  },

  // Diagonal of a polygon's bounding box (a size proxy, in pixels).
  diag(poly: Poly): number {
    const [x0, y0, x1, y1] = this._bbox(poly);
    if (!isFinite(x0)) return 0;
    return Math.hypot(x1 - x0, y1 - y0);
  },

  // Fraction of the dropped piece that overlaps its true footprint, by sampling.
  // The piece (rings) is at its true position; the drop is that shape translated
  // by `offset`. A point p lies in the dropped piece iff (p − offset) lies in the
  // true piece, so we Monte-Carlo a grid over the true bbox and count points that
  // fall in both. Returns overlapArea / pieceArea ∈ [0, 1].
  overlapFraction(rings: Poly, offset: Point, targetSamples = 1600): number {
    const [x0, y0, x1, y1] = this._bbox(rings);
    if (!isFinite(x0)) return 0;
    const w = x1 - x0, h = y1 - y0;
    if (w <= 0 || h <= 0) return 0;
    // Pick a grid step so the bbox yields ~targetSamples points.
    const step = Math.max(0.5, Math.sqrt((w * h) / targetSamples));
    let inTrue = 0, inBoth = 0;
    for (let x = x0 + step / 2; x <= x1; x += step) {
      for (let y = y0 + step / 2; y <= y1; y += step) {
        const p: Point = [x, y];
        if (!this._ptInPoly(p, rings)) continue;
        inTrue++;
        if (this._ptInPoly([x - offset[0], y - offset[1]], rings)) inBoth++;
      }
    }
    return inTrue ? inBoth / inTrue : 0;
  },

  // Required overlap scales with piece size: large countries demand a near-exact
  // 95% overlap; small ones are eased toward 50% (tolerance is never looser than
  // 50%). `rel` is the piece's size relative to the whole field.
  requiredOverlap(pieceDiag: number, fieldExtent: number): number {
    const MAX = 0.95, MIN = 0.5;
    const SMALL = 0.1, BIG = 0.45; // size band, as a fraction of the field diagonal
    if (fieldExtent <= 0) return MAX;
    const rel = pieceDiag / fieldExtent;
    const t = Math.max(0, Math.min(1, (rel - SMALL) / (BIG - SMALL)));
    return MIN + t * (MAX - MIN);
  },

  // Minimum distance between the boundaries of two polygons. 0 when they
  // overlap (an edge crosses, or one contains a vertex of the other); ~0 when
  // they merely touch; the separation gap otherwise.
  minEdgeGap(polyA: Poly, polyB: Poly): number {
    for (const ring of polyA) for (const p of ring)
      for (const rb of polyB) if (this._ptInRing(p, rb)) return 0;
    for (const ring of polyB) for (const p of ring)
      for (const ra of polyA) if (this._ptInRing(p, ra)) return 0;
    let min = Infinity;
    for (const ra of polyA) {
      const na = ra.length;
      for (let i = 0; i < na; i++) {
        const a1 = ra[i], a2 = ra[(i + 1) % na];
        for (const rb of polyB) {
          const nb = rb.length;
          for (let j = 0; j < nb; j++) {
            const d = this._segSeg(a1, a2, rb[j], rb[(j + 1) % nb]);
            if (d < min) min = d;
            if (min === 0) return 0;
          }
        }
      }
    }
    return min;
  },

  // Decide a drop by how much the piece overlaps where it actually belongs.
  // A near-exact drop (within minAbsTol px) always counts; otherwise the
  // overlap fraction must clear the size-scaled requiredOverlap threshold.
  validate(opts: ValidateOpts): Verdict {
    const { pieceRings, offset, requiredOverlap, minAbsTol } = opts;
    if (Math.hypot(offset[0], offset[1]) <= minAbsTol) {
      return { ok: true, fraction: 1 };
    }
    const fraction = this.overlapFraction(pieceRings, offset);
    return { ok: fraction >= requiredOverlap, fraction };
  },
};
