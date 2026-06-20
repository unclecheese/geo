import { describe, it, expect } from "vitest";
import { Placement, type Poly } from "@/lib/placement";

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

describe("Placement.validate", () => {
  const trueCentroid: [number, number] = [100, 100];

  it("snaps when the centroid lands within the radius — even with no neighbours", () => {
    const v = Placement.validate({
      dropCentroid: [105, 100],
      trueCentroid,
      pieceRings: square(95, 95),
      neighbourRings: [],
      borderGap: 5,
      centroidRadius: 10,
    });
    expect(v.ok).toBe(true);
    expect(v.reason).toBe("centroid");
    expect(v.snapTo).toEqual(trueCentroid);
  });

  it("rejects a far drop with no nearby neighbour", () => {
    const v = Placement.validate({
      dropCentroid: [200, 200],
      trueCentroid,
      pieceRings: square(195, 195),
      neighbourRings: [],
      borderGap: 5,
      centroidRadius: 10,
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("far");
    expect(v.snapTo).toBeNull();
  });

  it("snaps on a border touch when the centroid is out of range", () => {
    const v = Placement.validate({
      dropCentroid: [150, 100], // 50px away — centroid path fails
      trueCentroid,
      pieceRings: square(150, 95),
      neighbourRings: [square(160, 95)], // shares the piece's right edge
      borderGap: 5,
      centroidRadius: 1,
    });
    expect(v.ok).toBe(true);
    expect(v.reason).toBe("border");
  });

  it("does not border-snap to a neighbour that is too far", () => {
    const v = Placement.validate({
      dropCentroid: [150, 100],
      trueCentroid,
      pieceRings: square(150, 95),
      neighbourRings: [square(300, 95)],
      borderGap: 5,
      centroidRadius: 1,
    });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("far");
  });
});
