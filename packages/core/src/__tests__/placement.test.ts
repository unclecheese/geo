import { describe, it, expect } from "vitest";
import { Placement, type Poly } from "../placement";

// A 10×10 square with its lower-left corner at (x, y).
function square(x: number, y: number, s = 10): Poly {
  return [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]];
}

describe("Placement.minEdgeGap", () => {
  it("is 0 for overlapping polygons", () => {
    expect(Placement.minEdgeGap(square(0, 0), square(5, 5))).toBe(0);
  });
  it("is ~0 for polygons that share an edge", () => {
    expect(Placement.minEdgeGap(square(0, 0), square(10, 0))).toBeCloseTo(0, 6);
  });
  it("returns the separation gap for disjoint polygons", () => {
    expect(Placement.minEdgeGap(square(0, 0), square(30, 0))).toBeCloseTo(20, 6);
  });
});

describe("Placement.overlapFraction", () => {
  it("is 1 for a zero offset (perfect drop)", () => {
    expect(Placement.overlapFraction(square(0, 0, 100), [0, 0])).toBeCloseTo(1, 2);
  });
  it("is ~0.5 when a square is offset by half its width", () => {
    expect(Placement.overlapFraction(square(0, 0, 100), [50, 0])).toBeCloseTo(0.5, 1);
  });
  it("is 0 when the offset clears the shape entirely", () => {
    expect(Placement.overlapFraction(square(0, 0, 100), [200, 0])).toBe(0);
  });
});

describe("Placement.requiredOverlap", () => {
  it("demands 95% for a large piece", () => {
    expect(Placement.requiredOverlap(50, 100)).toBeCloseTo(0.95, 2);
  });
  it("eases to 50% for a tiny piece", () => {
    expect(Placement.requiredOverlap(2, 100)).toBeCloseTo(0.5, 2);
  });
  it("never goes below 50% tolerance", () => {
    expect(Placement.requiredOverlap(0, 100)).toBeGreaterThanOrEqual(0.5);
  });
});

describe("Placement.validate", () => {
  it("accepts a near-exact drop via the absolute tolerance", () => {
    const v = Placement.validate({
      pieceRings: square(0, 0, 100),
      offset: [2, 1],
      requiredOverlap: 0.95,
      minAbsTol: 4,
    });
    expect(v.ok).toBe(true);
    expect(v.fraction).toBe(1);
  });

  it("accepts a well-overlapping drop", () => {
    const v = Placement.validate({
      pieceRings: square(0, 0, 100),
      offset: [3, 0], // 97% overlap
      requiredOverlap: 0.95,
      minAbsTol: 0,
    });
    expect(v.ok).toBe(true);
    expect(v.fraction).toBeGreaterThan(0.95);
  });

  it("rejects a drop that overlaps too little", () => {
    const v = Placement.validate({
      pieceRings: square(0, 0, 100),
      offset: [40, 0], // 60% overlap, below a 95% bar
      requiredOverlap: 0.95,
      minAbsTol: 0,
    });
    expect(v.ok).toBe(false);
    expect(v.fraction).toBeLessThan(0.95);
  });
});
