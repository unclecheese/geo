import { describe, it, expect } from "vitest";
import { zoomAt, fitBounds } from "../map-transform";
import type { MapTransform } from "../map-transform";

// Applies a transform to a world/projected point, producing the screen point
// — the same convention TvMap's Skia group uses: screen = world*k + (tx,ty).
function apply(t: MapTransform, w: { x: number; y: number }): { x: number; y: number } {
  return { x: w.x * t.k + t.tx, y: w.y * t.k + t.ty };
}

describe("zoomAt", () => {
  it("keeps the screen point's world coordinate invariant across the zoom", () => {
    const t: MapTransform = { k: 1, tx: 10, ty: -5 };
    const cursor = { x: 400, y: 300 };
    const worldBefore = { x: (cursor.x - t.tx) / t.k, y: (cursor.y - t.ty) / t.k };

    const t2 = zoomAt(t, cursor, 3, 8);
    const worldAfter = { x: (cursor.x - t2.tx) / t2.k, y: (cursor.y - t2.ty) / t2.k };

    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 9);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 9);
    // The invariant point, projected back through both transforms, lands on
    // the same screen pixel — the practical guarantee callers rely on.
    expect(apply(t2, worldBefore).x).toBeCloseTo(cursor.x, 9);
    expect(apply(t2, worldBefore).y).toBeCloseTo(cursor.y, 9);
  });

  it("composes: zooming twice by f equals zooming once by f^2 (point still invariant)", () => {
    const t: MapTransform = { k: 1.2, tx: 50, ty: 20 };
    const cursor = { x: 900, y: 250 };

    const twice = zoomAt(zoomAt(t, cursor, 2, 100), cursor, 2, 100);
    const once = zoomAt(t, cursor, 4, 100);

    expect(twice.k).toBeCloseTo(once.k, 9);
    expect(twice.tx).toBeCloseTo(once.tx, 9);
    expect(twice.ty).toBeCloseTo(once.ty, 9);

    const world = { x: (cursor.x - t.tx) / t.k, y: (cursor.y - t.ty) / t.k };
    expect(apply(twice, world).x).toBeCloseTo(cursor.x, 9);
    expect(apply(once, world).x).toBeCloseTo(cursor.x, 9);
  });

  it("clamps k at maxK", () => {
    const t: MapTransform = { k: 5, tx: 0, ty: 0 };
    const t2 = zoomAt(t, { x: 100, y: 100 }, 3, 8);
    expect(t2.k).toBe(8);
    // Invariance still holds exactly at the clamped k.
    const cursor = { x: 100, y: 100 };
    const world = { x: (cursor.x - t.tx) / t.k, y: (cursor.y - t.ty) / t.k };
    expect(apply(t2, world).x).toBeCloseTo(cursor.x, 9);
    expect(apply(t2, world).y).toBeCloseTo(cursor.y, 9);
  });

  it("does not exceed maxK even when unclamped k would be smaller (no-op-ish zoom out via factor<1 still clamps upward bound only)", () => {
    const t: MapTransform = { k: 1, tx: 0, ty: 0 };
    const t2 = zoomAt(t, { x: 0, y: 0 }, 0.5, 8);
    expect(t2.k).toBeCloseTo(0.5, 9);
  });
});

describe("fitBounds", () => {
  it("centres the box in the viewport", () => {
    const pxBounds: [[number, number], [number, number]] = [
      [100, 200],
      [300, 400],
    ];
    const viewport = { w: 1920, h: 1080 };
    const t = fitBounds(pxBounds, viewport, 1.4, 8);

    const boxCentre = { x: 200, y: 300 };
    const screen = apply(t, boxCentre);
    expect(screen.x).toBeCloseTo(viewport.w / 2, 6);
    expect(screen.y).toBeCloseTo(viewport.h / 2, 6);
  });

  it("picks k = min(w/boxW, h/boxH) when within clamps", () => {
    const pxBounds: [[number, number], [number, number]] = [
      [0, 0],
      [200, 100],
    ];
    const viewport = { w: 1920, h: 1080 };
    // w/boxW = 9.6, h/boxH = 10.8 -> min is 9.6
    const t = fitBounds(pxBounds, viewport, 1.4, 20);
    expect(t.k).toBeCloseTo(9.6, 9);
  });

  it("clamps k to maxK for a very small box", () => {
    const pxBounds: [[number, number], [number, number]] = [
      [10, 10],
      [11, 11],
    ];
    const viewport = { w: 1920, h: 1080 };
    const t = fitBounds(pxBounds, viewport, 1.4, 8);
    expect(t.k).toBe(8);
    // Still centred at the clamped k.
    const screen = apply(t, { x: 10.5, y: 10.5 });
    expect(screen.x).toBeCloseTo(960, 6);
    expect(screen.y).toBeCloseTo(540, 6);
  });

  it("clamps k to minK for a very large box", () => {
    const pxBounds: [[number, number], [number, number]] = [
      [-5000, -5000],
      [5000, 5000],
    ];
    const viewport = { w: 1920, h: 1080 };
    const t = fitBounds(pxBounds, viewport, 1.4, 8);
    expect(t.k).toBe(1.4);
  });
});
