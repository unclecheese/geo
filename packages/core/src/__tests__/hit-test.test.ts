import { describe, it, expect } from "vitest";
import { geoEqualEarth } from "d3-geo";
import type { GeoProjection } from "d3-geo";
import type { Feature, Polygon } from "geojson";
import { pickCountryAt } from "../hit-test";
import type { TinyBox } from "../tiny-boxes";
import type { Country } from "../types";

// A synthetic world: one BIG square-polygon country, a TINY island with its
// own outline box (which deliberately overlaps BIG's polygon, to prove box
// precedence), and a POLYGON-LESS country (feature: null — the "no 50m
// geometry" case, e.g. a microstate) resolved only via its centroid.
function square(cx: number, cy: number, half: number): Polygon {
  return {
    type: "Polygon",
    coordinates: [
      [
        [cx - half, cy - half],
        [cx - half, cy + half],
        [cx + half, cy + half],
        [cx + half, cy - half],
        [cx - half, cy - half],
      ],
    ],
  };
}

const bigFeature: Feature = { type: "Feature", properties: {}, geometry: square(0, 0, 10) };

function makeCountry(id: string, opts: Partial<Country>): Country {
  return {
    id,
    name: id,
    cca3: id,
    region: "Test",
    neighbours: [],
    feature: null,
    centroid: null,
    ...opts,
  };
}

const big = makeCountry("BIG", { feature: bigFeature, centroid: [0, 0] });
// The island's own centroid sits inside BIG's polygon too, but its box is what
// must win — proving box precedence over polygon containment.
const island = makeCountry("ISL", { feature: null, centroid: [2, 2] });
// Polygon-less country, centroid far from BIG and the island, resolved only
// via nearest-centroid fallback.
const noPoly = makeCountry("NOP", { feature: null, centroid: [50, 50] });

const countries: Country[] = [big, island, noPoly];

const projection: GeoProjection = geoEqualEarth().fitExtent(
  [
    [0, 0],
    [1920, 1080],
  ],
  { type: "Sphere" } as never
);

// The island's box overlaps BIG's polygon (box is centred near BIG's own
// territory, not on the island's real — nonexistent — geometry).
const islandBoxCenter = projection([1, 1])!;
const boxes: TinyBox[] = [
  { id: "ISL", x: islandBoxCenter[0] - 6, y: islandBoxCenter[1] - 6, w: 12, h: 12 },
];

const MAX_DIST = 24;

describe("pickCountryAt", () => {
  it("resolves a point inside BIG's polygon to BIG via containment, even with a nearer centroid elsewhere", () => {
    // Pick a point inside BIG's polygon but notably closer to ISL's centroid
    // than to BIG's own centroid — proves containment beats nearest-centroid.
    const pt = projection([4, 4])!;
    const distToIslandCentroid = Math.hypot(pt[0] - islandBoxCenter[0], pt[1] - islandBoxCenter[1]);
    const bigCentroidPt = projection([0, 0])!;
    const distToBigCentroid = Math.hypot(pt[0] - bigCentroidPt[0], pt[1] - bigCentroidPt[1]);
    expect(distToIslandCentroid).toBeLessThan(distToBigCentroid);

    const result = pickCountryAt(pt, countries, boxes, projection, MAX_DIST);
    expect(result?.id).toBe("BIG");
  });

  it("resolves a point inside the tiny box to the island, even though the box overlaps BIG's polygon", () => {
    const box = boxes[0];
    const pt: [number, number] = [box.x + box.w / 2, box.y + box.h / 2];
    // Sanity: this point is also inside BIG's polygon.
    const inv = projection.invert!(pt)!;
    expect(Math.abs(inv[0])).toBeLessThan(10);
    expect(Math.abs(inv[1])).toBeLessThan(10);

    const result = pickCountryAt(pt, countries, boxes, projection, MAX_DIST);
    expect(result?.id).toBe("ISL");
  });

  it("resolves a point near the polygon-less country's centroid to it", () => {
    const pt = projection([50, 50])!;
    const result = pickCountryAt(pt, countries, boxes, projection, MAX_DIST);
    expect(result?.id).toBe("NOP");
  });

  it("returns null for an open-ocean point far from everything", () => {
    const pt = projection([170, -80])!;
    const result = pickCountryAt(pt, countries, boxes, projection, MAX_DIST);
    expect(result).toBeNull();
  });
});
