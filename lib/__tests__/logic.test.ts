import { describe, it, expect } from "vitest";
import { Logic } from "@/lib/logic";
import type { Country, LeitnerEntry, ModeId } from "@/lib/types";

function mk(id: string, region: string, opts: Partial<Country> = {}): Country {
  return { id, name: id, cca3: id, region, subregion: region, neighbours: [], ...opts };
}

// A deterministic LCG so weighted/shuffle tests are reproducible.
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe("Logic.leitnerUpdate", () => {
  it("promotes on correct, capped at box 5", () => {
    let e: LeitnerEntry | undefined;
    for (let i = 0; i < 10; i++) e = Logic.leitnerUpdate(e, true, 1000);
    expect(e!.box).toBe(5);
    expect(e!.seen).toBe(10);
    expect(e!.correct).toBe(10);
    expect(e!.lastSeen).toBe(1000);
  });

  it("resets to box 1 on a wrong answer", () => {
    let e = Logic.leitnerUpdate(undefined, true);
    e = Logic.leitnerUpdate(e, true);
    expect(e.box).toBe(3);
    e = Logic.leitnerUpdate(e, false);
    expect(e.box).toBe(1);
    expect(e.seen).toBe(3);
  });
});

describe("Logic.itemWeight", () => {
  it("weights a never-seen item highest", () => {
    expect(Logic.itemWeight(undefined)).toBe(12);
  });
  it("weights box 1 above box 5", () => {
    const now = 10_000_000;
    const w1 = Logic.itemWeight({ box: 1, seen: 5, correct: 0, lastSeen: now }, now);
    const w5 = Logic.itemWeight({ box: 5, seen: 5, correct: 5, lastSeen: now }, now);
    expect(w1).toBeGreaterThan(w5);
  });
});

describe("Logic.normalize / matchAnswer", () => {
  it("strips accents and turns punctuation into a separator", () => {
    // ô → o (accent dropped); the apostrophe becomes a space.
    expect(Logic.normalize("Côte d'Ivoire")).toBe("cote d ivoire");
  });
  it("grades forgivingly on case/accents/punctuation", () => {
    expect(Logic.matchAnswer("cote d ivoire", "Côte d'Ivoire")).toBe(true);
    expect(Logic.matchAnswer("  UNITED states ", "United States")).toBe(true);
    expect(Logic.matchAnswer("", "Anything")).toBe(false);
    expect(Logic.matchAnswer("france", "Germany")).toBe(false);
  });
});

describe("Logic.suggest", () => {
  it("returns prefix matches before substring matches", () => {
    const out = Logic.suggest("ic", ["Iceland", "Mexico", "Micronesia"], 6);
    expect(out[0]).toBe("Iceland"); // prefix
    expect(out).toContain("Mexico"); // substring "ic"
    expect(out).toContain("Micronesia");
  });
  it("returns nothing for empty input", () => {
    expect(Logic.suggest("", ["Iceland"])).toEqual([]);
  });
});

describe("Logic.sanitizeModes", () => {
  it("coerces a mixed set down to the first mode's group", () => {
    expect(Logic.sanitizeModes(["find", "capital"] as ModeId[])).toEqual(["find"]);
    expect(Logic.sanitizeModes(["capital", "flag", "find"] as ModeId[])).toEqual(["capital", "flag"]);
  });
  it("falls back to map modes when empty or invalid", () => {
    expect(Logic.sanitizeModes([])).toEqual(["find", "name"]);
    expect(Logic.sanitizeModes(["bogus" as ModeId])).toEqual(["find", "name"]);
  });
});

describe("Logic.filterPool", () => {
  const pool = [mk("1", "Asia", { subregion: "Eastern Asia" }), mk("2", "Europe"), mk("3", "Asia")];
  it("filters by region and subregion", () => {
    expect(Logic.filterPool(pool, "Asia", "all").map((c) => c.id)).toEqual(["1", "3"]);
    expect(Logic.filterPool(pool, "Asia", "Eastern Asia").map((c) => c.id)).toEqual(["1"]);
    expect(Logic.filterPool(pool, "all", "all")).toHaveLength(3);
  });
});

describe("Logic.makeChoices", () => {
  it("always includes the answer and prefers same-region distractors", () => {
    const item = mk("1", "Asia");
    const pool = [item, mk("2", "Asia"), mk("3", "Asia"), mk("4", "Europe"), mk("5", "Europe")];
    const opts = Logic.makeChoices(item, pool, 4, { rng: seeded(7) });
    expect(opts).toHaveLength(4);
    expect(opts).toContainEqual(item);
    const sameRegion = opts.filter((c) => c.region === "Asia" && c.id !== "1");
    expect(sameRegion.length).toBe(2); // both Asian distractors used before European
  });
});

describe("Logic.selectNextItem", () => {
  it("returns null on an empty pool and respects avoidId", () => {
    expect(Logic.selectNextItem([], {}, "find")).toBeNull();
    const pool = [mk("1", "Asia"), mk("2", "Asia")];
    const got = Logic.selectNextItem(pool, {}, "find", { avoidId: "1", rng: seeded(1) });
    expect(got!.id).toBe("2");
  });
});

describe("Logic.fmtDuration", () => {
  it("formats m:ss and h:mm:ss", () => {
    expect(Logic.fmtDuration(0)).toBe("0:00");
    expect(Logic.fmtDuration(65_000)).toBe("1:05");
    expect(Logic.fmtDuration(3_725_000)).toBe("1:02:05");
  });
});

describe("Logic.isTiny", () => {
  it("flags a country whose largest polygon is a tiny fraction of the sphere", () => {
    // Fractions of projected sphere area (viewport-independent).
    expect(Logic.isTiny(6e-7)).toBe(true); // Micronesia's largest island
    expect(Logic.isTiny(2.1e-5)).toBe(true); // Fiji's largest island — just under
    expect(Logic.isTiny(3.3e-5)).toBe(false); // Kuwait — a visible solid blob
  });
});

describe("Logic.boxHalfSizesNoOverlap", () => {
  // Two axis-aligned squares overlap iff their centre Chebyshev distance is
  // strictly less than the sum of their half-sizes.
  const overlaps = (
    a: { x: number; y: number },
    ha: number,
    b: { x: number; y: number },
    hb: number
  ) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) < ha + hb - 1e-9;

  it("leaves an isolated box at its desired size", () => {
    expect(Logic.boxHalfSizesNoOverlap([{ x: 0, y: 0 }], [20])).toEqual([20]);
  });

  it("shrinks close neighbours so their boxes never overlap", () => {
    const centers = [
      { x: 0, y: 0 },
      { x: 10, y: 0 }, // 10 apart, both want half=20 → must shrink to ≤5 each
      { x: 200, y: 200 }, // isolated → keeps its desired size
    ];
    const halves = Logic.boxHalfSizesNoOverlap(centers, [20, 20, 8]);
    expect(halves[0]).toBeCloseTo(5);
    expect(halves[1]).toBeCloseTo(5);
    expect(halves[2]).toBe(8);
    for (let i = 0; i < centers.length; i++)
      for (let j = i + 1; j < centers.length; j++)
        expect(overlaps(centers[i], halves[i], centers[j], halves[j])).toBe(false);
  });

  it("never lets any pair overlap across a dense cluster", () => {
    const centers = [
      { x: 0, y: 0 },
      { x: 3, y: 1 },
      { x: 5, y: 4 },
      { x: 1, y: 6 },
      { x: 40, y: 40 },
    ];
    const halves = Logic.boxHalfSizesNoOverlap(centers, centers.map(() => 20));
    for (let i = 0; i < centers.length; i++)
      for (let j = i + 1; j < centers.length; j++)
        expect(overlaps(centers[i], halves[i], centers[j], halves[j])).toBe(false);
  });
});

describe("Logic.nearestWithin", () => {
  const sites = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it("returns the index of the nearest site inside the cutoff", () => {
    expect(Logic.nearestWithin(sites, 5, 5, 44)).toBe(0);
    expect(Logic.nearestWithin(sites, 90, 10, 44)).toBe(1);
  });

  it("returns -1 when the closest site is beyond the cutoff", () => {
    expect(Logic.nearestWithin(sites, 50, 50, 44)).toBe(-1); // ~70px from each
    expect(Logic.nearestWithin([], 0, 0, 44)).toBe(-1);
  });

  it("partitions space so adjacent sites never both claim a point (Voronoi)", () => {
    // A point just left of the midline between site 0 and site 1 goes to 0;
    // just right goes to 1 — one owner per point, never both.
    expect(Logic.nearestWithin(sites, 49, 0, 999)).toBe(0);
    expect(Logic.nearestWithin(sites, 51, 0, 999)).toBe(1);
  });
});
