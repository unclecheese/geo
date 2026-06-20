export type Point = [number, number];
export type Ring = Point[];
export type Poly = Ring[]; // a polygon as an array of rings (outer + holes)

export interface ValidateOpts {
  dropCentroid: Point;
  trueCentroid: Point;
  pieceRings: Poly;
  neighbourRings?: Poly[];
  borderGap: number;
  centroidRadius: number;
}

export interface Verdict {
  ok: boolean;
  snapTo: Point | null;
  reason: "centroid" | "border" | "far";
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

  // Decide a drop on position alone — any country can be placed, neighbour or
  // not. Snap when the piece's centroid is within the fallback radius of its
  // true centroid, OR when its edges come within the border-gap of a country
  // already on the map. On success the snap target is the true position.
  validate(opts: ValidateOpts): Verdict {
    const { dropCentroid, trueCentroid, pieceRings, neighbourRings, borderGap, centroidRadius } = opts;
    if (this._dist(dropCentroid, trueCentroid) <= centroidRadius) {
      return { ok: true, snapTo: trueCentroid, reason: "centroid" };
    }
    for (const nb of neighbourRings || []) {
      if (this.minEdgeGap(pieceRings, nb) <= borderGap) {
        return { ok: true, snapTo: trueCentroid, reason: "border" };
      }
    }
    return { ok: false, snapTo: null, reason: "far" };
  },
};
