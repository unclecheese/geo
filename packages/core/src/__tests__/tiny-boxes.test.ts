import { describe, it, expect } from "vitest";
import { geoEqualEarth, geoPath } from "d3-geo";
import type { GeoProjection } from "d3-geo";
import type { Feature, Polygon } from "geojson";
import { computeTinyIds, layoutTinyBoxes, resolvePoint, type TinyBox } from "../tiny-boxes";
import { largestPolygonCentroid } from "../data-layer";
import type { Country } from "../types";

// A synthetic three-country world: one modest, non-tiny landmass (CONT) near
// the projection's centre, and two tiny islands (ISL-A, ISL-B) a few degrees
// apart in a different part of the map — far enough apart to each get their
// own non-overlapping box, close enough to exercise the no-overlap clamp and
// the nearest-centroid fallback. Coordinates are plain [lng, lat] degrees.
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

const contFeature: Feature = { type: "Feature", properties: {}, geometry: square(0, 0, 3) };
const islandAFeature: Feature = { type: "Feature", properties: {}, geometry: square(60, 10, 0.05) };
const islandBFeature: Feature = { type: "Feature", properties: {}, geometry: square(65, 10, 0.05) };
// A sub-pixel ENCLAVE: same tiny landmass as an island but WITH a land border.
// Effectively unclickable as a bare polygon, so it earns a box (host-overlapping).
const enclaveFeature: Feature = { type: "Feature", properties: {}, geometry: square(70, 10, 0.05) };
// A small-but-clickable bordered country: still tiny by area, but its landmass
// projects large enough (> ENCLAVE_MAX_HALF) to click directly — no box.
const smallFeature: Feature = { type: "Feature", properties: {}, geometry: square(-40, 0, 0.4) };

function makeCountry(id: string, feat: Feature, borders: string[]): Country {
  return {
    id,
    name: id,
    cca3: id,
    region: "Test",
    neighbours: [],
    feature: feat,
    centroid: largestPolygonCentroid(feat),
    _borders: borders,
  };
}

const continent = makeCountry("CONT", contFeature, ["OTH"]); // has a land border: not "tiny island"
const islandA = makeCountry("ISLA", islandAFeature, []); // no land border: tiny island
const islandB = makeCountry("ISLB", islandBFeature, []); // no land border: tiny island
const enclave = makeCountry("ENCL", enclaveFeature, ["CONT"]); // bordered + sub-pixel: enclave, gets a box
const small = makeCountry("SMAL", smallFeature, ["OTH"]); // bordered + tiny but clickable: no box

const countries: Country[] = [continent, islandA, islandB, enclave, small];

const projection: GeoProjection = geoEqualEarth().fitExtent(
  [
    [0, 0],
    [960, 540],
  ],
  { type: "Sphere" } as never
);

describe("computeTinyIds", () => {
  it("flags every tiny landmass, island or bordered, not the continental country", () => {
    const tinyIds = computeTinyIds(countries);
    expect(tinyIds.has("ISLA")).toBe(true);
    expect(tinyIds.has("ISLB")).toBe(true);
    expect(tinyIds.has("ENCL")).toBe(true);
    expect(tinyIds.has("SMAL")).toBe(true); // small enough to be "tiny", but big enough to click
    expect(tinyIds.has("CONT")).toBe(false);
  });
});

describe("layoutTinyBoxes", () => {
  const tinyIds = computeTinyIds(countries);
  const boxes = layoutTinyBoxes(countries, tinyIds, projection);

  it("boxes the tiny islands and the sub-pixel enclave, but not the clickable small country or the continent", () => {
    // ENCL is bordered yet sub-pixel → gets a (host-overlapping) box; SMAL is
    // bordered and tiny-by-area but projects large enough to click → no box.
    expect(boxes.map((b) => b.id).sort()).toEqual(["ENCL", "ISLA", "ISLB"]);
  });

  it("boxes are pairwise non-overlapping (AABB check)", () => {
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        const overlap = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
        expect(overlap).toBe(false);
      }
    }
  });

  it("each box contains its landmass's projected centroid within padding", () => {
    const byId = new Map(boxes.map((b) => [b.id, b]));
    for (const c of [islandA, islandB, enclave]) {
      const box = byId.get(c.id)!;
      const p = projection(c.centroid as [number, number])!;
      expect(p[0]).toBeGreaterThanOrEqual(box.x);
      expect(p[0]).toBeLessThanOrEqual(box.x + box.w);
      expect(p[1]).toBeGreaterThanOrEqual(box.y);
      expect(p[1]).toBeLessThanOrEqual(box.y + box.h);
    }
  });
});

describe("resolvePoint", () => {
  const tinyIds = computeTinyIds(countries);
  const boxes: TinyBox[] = layoutTinyBoxes(countries, tinyIds, projection);
  const path = geoPath(projection);
  const MAX_DIST = 44;

  it("resolves a point inside island A's box to island A", () => {
    const box = boxes.find((b) => b.id === "ISLA")!;
    const pt: [number, number] = [box.x + box.w / 2, box.y + box.h / 2];
    const result = resolvePoint(pt, boxes, countries, projection, MAX_DIST);
    expect(result?.id).toBe("ISLA");
  });

  it("resolves a point inside the enclave's box to the enclave, not its host", () => {
    const box = boxes.find((b) => b.id === "ENCL")!;
    const pt: [number, number] = [box.x + box.w / 2, box.y + box.h / 2];
    const result = resolvePoint(pt, boxes, countries, projection, MAX_DIST);
    expect(result?.id).toBe("ENCL");
  });

  it("resolves a point between the boxes to the nearest centroid", () => {
    // A point just off CONT's eastern edge: outside every tiny box (the
    // islands are projected far away) and within MAX_DIST of CONT's centroid,
    // so it falls through to the nearest-centroid fallback and resolves to CONT.
    const bounds = path.bounds(contFeature as never) as [[number, number], [number, number]];
    const pt: [number, number] = [bounds[1][0] + 2, (bounds[0][1] + bounds[1][1]) / 2];
    const result = resolvePoint(pt, boxes, countries, projection, MAX_DIST);
    expect(result?.id).toBe("CONT");
  });

  it("returns null for a point far from everything (mid-ocean)", () => {
    const pt: [number, number] = [projection([170, -80])![0], projection([170, -80])![1]];
    const result = resolvePoint(pt, boxes, countries, projection, MAX_DIST);
    expect(result).toBeNull();
  });
});
