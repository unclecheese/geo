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
  it("filters by region and subregion (multi-select)", () => {
    expect(Logic.filterPool(pool, ["Asia"], []).map((c) => c.id)).toEqual(["1", "3"]);
    expect(Logic.filterPool(pool, ["Asia"], ["Eastern Asia"]).map((c) => c.id)).toEqual(["1"]);
    expect(Logic.filterPool(pool, [], [])).toHaveLength(3);
  });
  it("treats an empty array as no filter, and unions multiple selections", () => {
    expect(Logic.filterPool(pool, ["Asia", "Europe"], []).map((c) => c.id)).toEqual(["1", "2", "3"]);
    expect(Logic.filterPool(pool, [], ["Eastern Asia"]).map((c) => c.id)).toEqual(["1"]);
  });
});

describe("Logic.makeChoices", () => {
  it("always includes the answer and prefers same-subregion distractors over same-region-only", () => {
    // want = n-1 = 2, so the top tier (2*want = 4) holds exactly the two
    // same-subregion mates plus the two nearest same-region-only filler —
    // the weaker, other-region country is ranked out of the tier entirely,
    // so it can never appear regardless of the rng draw.
    const item = mk("1", "Asia", { subregion: "Eastern Asia" });
    const pool = [
      item,
      mk("2", "Asia", { subregion: "Eastern Asia" }),
      mk("3", "Asia", { subregion: "Eastern Asia" }),
      mk("4", "Asia", { subregion: "South-Eastern Asia" }),
      mk("5", "Asia", { subregion: "South-Eastern Asia" }),
      mk("6", "Europe", { subregion: "Western Europe" }),
    ];
    for (const seed of [1, 2, 3, 7, 42]) {
      const opts = Logic.makeChoices(item, pool, 3, { rng: seeded(seed) });
      expect(opts).toHaveLength(3);
      expect(opts).toContainEqual(item);
      expect(opts.some((c) => c.id === "6")).toBe(false); // ranked out of the tier
    }

    // Across many seeds, the same-subregion pair should be picked far more
    // often than the same-region-only pair, since rank-weighted sampling
    // favours the top of the tier without being fully deterministic.
    let subregionPicks = 0;
    for (let seed = 0; seed < 200; seed++) {
      const opts = Logic.makeChoices(item, pool, 3, { rng: seeded(seed) });
      subregionPicks += opts.filter((c) => c.subregion === "Eastern Asia" && c.id !== "1").length;
    }
    expect(subregionPicks).toBeGreaterThan(200); // well above the ~50% chance floor
  });

  it("falls back to fewer distractors when the pool is small", () => {
    const item = mk("1", "Asia");
    const opts = Logic.makeChoices(item, [item, mk("2", "Asia")], 4, { rng: seeded(3) });
    expect(opts).toHaveLength(2);
    expect(opts).toContainEqual(item);
  });
});

describe("Logic.revealName", () => {
  it("reveals the first `count` letters and masks the rest, showing punctuation literally", () => {
    expect(Logic.revealName("Chile", 0)).toBe("_ _ _ _ _");
    expect(Logic.revealName("Chile", 2)).toBe("C h _ _ _");
    expect(Logic.revealName("Costa Rica", 3)).toBe("C o s _ _   _ _ _ _");
  });
});

describe("Logic.pickShown", () => {
  it("returns all neighbours unchanged when at or below the cap", () => {
    const ns = [mk("a", "Europe"), mk("b", "Europe"), mk("c", "Europe")];
    expect(Logic.pickShown(ns, 6)).toHaveLength(3);
    expect(Logic.pickShown(ns, 6).map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("picks exactly `max` when there are more, all drawn from the input", () => {
    const ns = Array.from({ length: 14 }, (_, i) => mk("n" + i, "Asia"));
    const ids = new Set(ns.map((c) => c.id));
    const got = Logic.pickShown(ns, 6, seeded(7));
    expect(got).toHaveLength(6);
    expect(new Set(got.map((c) => c.id)).size).toBe(6); // no duplicates
    for (const c of got) expect(ids.has(c.id)).toBe(true);
  });

  it("does not mutate the input array", () => {
    const ns = Array.from({ length: 10 }, (_, i) => mk("n" + i, "Asia"));
    Logic.pickShown(ns, 6, seeded(1));
    expect(ns).toHaveLength(10);
  });
});

describe("Logic.expandBounds", () => {
  it("grows the box by the factor of its span on each side", () => {
    const out = Logic.expandBounds([[0, 0], [10, 20]], 0.5);
    expect(out).toEqual([[-5, -10], [15, 30]]);
  });

  it("clamps latitude to the poles", () => {
    const out = Logic.expandBounds([[0, -80], [10, 80]], 0.5);
    expect(out[0][1]).toBe(-90);
    expect(out[1][1]).toBe(90);
  });
});

describe("Logic.letterCount", () => {
  it("counts only alphabetic characters", () => {
    expect(Logic.letterCount("Chile")).toBe(5);
    expect(Logic.letterCount("Costa Rica")).toBe(9);
    expect(Logic.letterCount("Côte d'Ivoire")).toBe(10); // ô isn't [a-zA-Z], matching revealName's mask
  });
});

describe("Logic.nextEliminate", () => {
  const choices = [mk("1", "Asia"), mk("2", "Asia"), mk("3", "Asia"), mk("4", "Asia")];
  it("returns a wrong, non-eliminated id", () => {
    const id = Logic.nextEliminate(choices, "1", [], seeded(5));
    expect(id).not.toBe("1");
    expect(["2", "3", "4"]).toContain(id);
  });
  it("never returns an already-eliminated id, and returns null once exhausted", () => {
    const id = Logic.nextEliminate(choices, "1", ["2", "3"], seeded(5));
    expect(id).toBe("4");
    expect(Logic.nextEliminate(choices, "1", ["2", "3", "4"], seeded(5))).toBeNull();
  });
});

describe("Logic.levenshtein", () => {
  it("computes classic edit distance, case-insensitively", () => {
    expect(Logic.levenshtein("chile", "Chile")).toBe(0);
    expect(Logic.levenshtein("kitten", "sitting")).toBe(3);
    expect(Logic.levenshtein("", "abc")).toBe(3);
  });
});

describe("Logic.haversineKm", () => {
  it("approximates London to Paris at roughly 340km", () => {
    const london: [number, number] = [51.5074, -0.1278];
    const paris: [number, number] = [48.8566, 2.3522];
    const km = Logic.haversineKm(london, paris);
    expect(km).toBeGreaterThan(300);
    expect(km).toBeLessThan(380);
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
