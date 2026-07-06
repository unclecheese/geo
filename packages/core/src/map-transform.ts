// Pure zoom/pan transform math shared by every renderer that draws a
// projected map as world coords * k + (tx, ty) (the Skia group transform on
// TV; the same convention as a d3-zoom transform on web). No DOM, no D3
// zoom behaviour — just the algebra, so it can be unit tested without a
// browser and reused by any future MapPort implementation.

/** k = scale, (tx, ty) = screen-space translation applied after scaling:
 *  screen = world * k + (tx, ty). */
export interface MapTransform {
  k: number;
  tx: number;
  ty: number;
}

/** Scale `t.k` by `factor` (clamped to `maxK`) while keeping the screen point
 *  `pt`'s underlying world coordinate fixed — i.e. applying the returned
 *  transform to that world coordinate still lands on `pt`.
 *
 *  Derivation: `pt`'s world coordinate under `t` is `w = (pt - t) / t.k`.
 *  For the new transform t' to map that same `w` back to `pt`:
 *    pt = w * k' + t'  =>  t' = pt - w * k' = pt - (pt - t) * (k' / t.k)
 */
export function zoomAt(
  t: MapTransform,
  pt: { x: number; y: number },
  factor: number,
  maxK: number
): MapTransform {
  const k = Math.min(t.k * factor, maxK);
  const ratio = k / t.k;
  return {
    k,
    tx: pt.x - (pt.x - t.tx) * ratio,
    ty: pt.y - (pt.y - t.ty) * ratio,
  };
}

/** A transform that fits a projected (px) bounding box into `viewport`,
 *  centring the box and choosing k = min(w/boxW, h/boxH) clamped to
 *  [minK, maxK]. */
export function fitBounds(
  pxBounds: [[number, number], [number, number]],
  viewport: { w: number; h: number },
  minK: number,
  maxK: number
): MapTransform {
  const [[x0, y0], [x1, y1]] = pxBounds;
  const boxW = x1 - x0;
  const boxH = y1 - y0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;

  let k = Math.min(viewport.w / boxW, viewport.h / boxH);
  if (!isFinite(k)) k = maxK;
  k = Math.max(minK, Math.min(k, maxK));

  return {
    k,
    tx: viewport.w / 2 - cx * k,
    ty: viewport.h / 2 - cy * k,
  };
}
