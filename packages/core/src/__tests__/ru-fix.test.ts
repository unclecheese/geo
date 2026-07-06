import { describe, it, expect } from "vitest";
import {
  unwrapAntimeridian,
  clipRingToRect,
  crimeaPolygon,
  europeanRussia,
  ukraineWithCrimea,
} from "../ru-fix";
import type { Feature } from "geojson";

describe("unwrapAntimeridian", () => {
  it("shifts far-west (Chukotka/Diomede) longitudes by +360", () => {
    const r = unwrapAntimeridian([[-169, 66], [-179, 65], [40, 50]]);
    expect(r[0][0]).toBe(191);
    expect(r[1][0]).toBe(181);
    expect(r[2][0]).toBe(40); // a normal eastern vertex is untouched
  });
});

describe("clipRingToRect", () => {
  it("clips a square to the rectangle's eastern edge", () => {
    const sq: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
    const clipped = clipRingToRect(sq, [-10, -10, 60, 110]);
    const maxX = Math.max(...clipped.map((p) => p[0]));
    expect(maxX).toBeCloseTo(60, 6);
  });
  it("returns empty when nothing is inside", () => {
    const sq: [number, number][] = [[200, 200], [300, 200], [300, 300], [200, 300], [200, 200]];
    expect(clipRingToRect(sq, [0, 0, 100, 100])).toEqual([]);
  });
});

// A minimal stand-in for Russia: a wide mainland straddling the Urals plus a
// detached Crimea-sized polygon inside the Crimea bbox.
const fakeRussia: Feature = {
  type: "Feature",
  id: "643",
  properties: {},
  geometry: {
    type: "MultiPolygon",
    coordinates: [
      // mainland 20°E → 120°E
      [[[20, 45], [120, 45], [120, 70], [20, 70], [20, 45]]],
      // Crimea (bbox ~33–36, 44.5–46)
      [[[33, 44.5], [36, 44.5], [36, 46], [33, 46], [33, 44.5]]],
    ],
  },
};

const fakeUkraine: Feature = {
  type: "Feature",
  id: "804",
  properties: {},
  geometry: { type: "Polygon", coordinates: [[[22, 45], [40, 45], [40, 52], [22, 52], [22, 45]]] },
};

describe("europeanRussia", () => {
  it("drops Crimea and clips the mainland at the Urals (60°E)", () => {
    const eu = europeanRussia(fakeRussia);
    expect(eu.geometry.type).toBe("MultiPolygon");
    const coords = (eu.geometry as GeoJSON.MultiPolygon).coordinates;
    // Only the mainland survives (Crimea removed).
    expect(coords.length).toBe(1);
    const maxX = Math.max(...coords[0][0].map((p) => p[0]));
    expect(maxX).toBeCloseTo(60, 6); // clipped to the Urals
  });
});

describe("crimeaPolygon / ukraineWithCrimea", () => {
  it("isolates Crimea from Russia", () => {
    expect(crimeaPolygon(fakeRussia)).not.toBeNull();
  });
  it("grafts Crimea onto Ukraine", () => {
    const ua = ukraineWithCrimea(fakeUkraine, fakeRussia);
    expect(ua.geometry.type).toBe("MultiPolygon");
    expect((ua.geometry as GeoJSON.MultiPolygon).coordinates.length).toBe(2);
  });
});
