import { describe, it, expect, beforeEach } from "vitest";
import { DataLayer, largestPolygonCentroid } from "../data-layer";
import { setKVStorage } from "../platform";
import { memoryKV } from "./platform.test";
import type { Feature } from "geojson";

beforeEach(() => {
  setKVStorage(memoryKV());
});

// A tiny but valid TopoJSON: two square countries (ids 4 and 76). Country 586
// (Pakistan) deliberately has NO geometry, to exercise the feature-less path.
const topo = {
  type: "Topology",
  arcs: [
    [[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]],
    [[20, 0], [20, 10], [30, 10], [30, 0], [20, 0]],
  ],
  objects: {
    countries: {
      type: "GeometryCollection",
      geometries: [
        { type: "Polygon", id: 4, arcs: [[0]] },
        { type: "Polygon", id: 76, arcs: [[1]] },
      ],
    },
  },
} as unknown as Parameters<typeof DataLayer._hydrate>[0];

const meta = [
  { ccn3: "004", cca2: "AF", cca3: "AFG", name: { common: "Afghanistan" }, capital: ["Kabul"], region: "Asia", subregion: "Southern Asia", unMember: true, borders: ["PAK"], latlng: [33, 66] as [number, number] },
  { ccn3: "586", cca2: "PK", cca3: "PAK", name: { common: "Pakistan" }, capital: ["Islamabad"], region: "Asia", unMember: true, borders: ["AFG"], latlng: [30, 70] as [number, number] },
  { ccn3: "076", cca2: "BR", cca3: "BRA", name: { common: "Brazil" }, capital: ["Brasília"], region: "Americas", unMember: true, borders: [] },
  { ccn3: "010", cca2: "AQ", cca3: "ATA", name: { common: "Antarctica" }, region: "Antarctic", unMember: false, independent: false },
];

describe("DataLayer._hydrate", () => {
  DataLayer._hydrate(topo, meta);
  const byCca3 = (code: string) => DataLayer.countries.find((c) => c.cca3 === code);

  it("keeps only sovereign countries", () => {
    expect(DataLayer.countries).toHaveLength(3); // AFG, PAK, BRA — Antarctica excluded
    expect(byCca3("ATA")).toBeUndefined();
  });

  it("joins geometry by padded ccn3, leaving feature-less countries null", () => {
    expect(byCca3("AFG")!.feature).toBeTruthy(); // id 4 -> "004"
    expect(byCca3("BRA")!.feature).toBeTruthy(); // id 76 -> "076"
    expect(byCca3("PAK")!.feature).toBeNull(); // 586 not in the topology
  });

  it("resolves land borders into neighbour objects", () => {
    expect(byCca3("AFG")!.neighbours.map((n) => n.cca3)).toEqual(["PAK"]);
    expect(byCca3("PAK")!.neighbours.map((n) => n.cca3)).toEqual(["AFG"]);
    expect(byCca3("BRA")!.neighbours).toEqual([]);
  });

  it("derives a centroid for countries with geometry, falling back to latlng", () => {
    expect(byCca3("AFG")!.centroid).not.toBeNull();
    // PAK has no feature, so its centroid falls back to [lng, lat] from latlng.
    expect(byCca3("PAK")!.centroid).toEqual([70, 30]);
  });

  it("retains the raw topology and indexes features by padded ccn3", () => {
    expect(DataLayer.topo).toBe(topo);
    expect(DataLayer.featureById.has("004")).toBe(true);
    expect(DataLayer.featureById.has("076")).toBe(true);
    expect(DataLayer.pad3(4)).toBe("004");
  });
});

describe("DataLayer._hydrate id collisions", () => {
  // Two features share id 4: a big square listed FIRST, then a tiny sliver last.
  // Last-write-wins (the old behaviour) would hand id 004 the sliver — the real
  // world-atlas bug where Australia got the Ashmore reef instead of the mainland.
  const dupTopo = {
    type: "Topology",
    arcs: [
      [[0, 0], [0, 20], [20, 20], [20, 0], [0, 0]], // big
      [[100, 0], [100, 1], [101, 1], [101, 0], [100, 0]], // tiny sliver
    ],
    objects: {
      countries: {
        type: "GeometryCollection",
        geometries: [
          { type: "Polygon", id: 4, arcs: [[0]] },
          { type: "Polygon", id: 4, arcs: [[1]] },
        ],
      },
    },
  } as unknown as Parameters<typeof DataLayer._hydrate>[0];
  const dupMeta = [
    { ccn3: "004", cca2: "AF", cca3: "AFG", name: { common: "Afghanistan" }, region: "Asia", unMember: true },
  ];

  it("keeps the geographically largest feature, not the last one written", () => {
    DataLayer._hydrate(dupTopo, dupMeta as never);
    const feat = DataLayer.featureById.get("004")!;
    const g = feat.geometry as { type: string; coordinates: number[][][] };
    expect(g.coordinates[0][0]).toEqual([0, 0]); // big square's first vertex
  });
});

describe("largestPolygonCentroid", () => {
  it("anchors on the biggest polygon, not the whole-feature centroid", () => {
    const feat: Feature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]], // big, centroid ~ (5,5)
          [[[80, 80], [80, 81], [81, 81], [81, 80], [80, 80]]], // tiny, far away
        ],
      },
    };
    const [lng, lat] = largestPolygonCentroid(feat);
    expect(lng).toBeGreaterThan(2);
    expect(lng).toBeLessThan(8);
    expect(lat).toBeGreaterThan(2);
    expect(lat).toBeLessThan(8);
  });

  it("falls back to the plain centroid for a single Polygon", () => {
    const feat: Feature = {
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]] },
    };
    const [lng, lat] = largestPolygonCentroid(feat);
    expect(lng).toBeCloseTo(5, 0);
    expect(lat).toBeCloseTo(5, 0);
  });
});
