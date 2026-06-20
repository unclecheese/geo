import { describe, it, expect } from "vitest";
import { BuildGraph } from "@/lib/build-graph";
import type { Country } from "@/lib/types";

function mk(id: string, region: string, opts: Partial<Country> = {}): Country {
  return { id, name: id, cca3: id, region, neighbours: [], feature: {} as Country["feature"], ...opts };
}

// A small fixture: A–B border each other in Asia; A also borders C in Europe
// (a cross-continent edge that must be ignored); D is an isolated Asian island;
// E is an Asian country with no rendered polygon.
function fixture() {
  const A = mk("A", "Asia");
  const B = mk("B", "Asia");
  const C = mk("C", "Europe");
  const D = mk("D", "Asia"); // no neighbours — isolated
  const E = mk("E", "Asia", { feature: null }); // no geometry
  A.neighbours = [B, C];
  B.neighbours = [A];
  C.neighbours = [A];
  return { A, B, C, D, E, all: [A, B, C, D, E] };
}

describe("BuildGraph.adjacency", () => {
  it("keeps only same-continent land-border edges", () => {
    const { all } = fixture();
    const adj = BuildGraph.adjacency(all, "Asia");
    expect([...adj.get("A")!]).toEqual(["B"]); // C dropped — different continent
    expect([...adj.get("B")!]).toEqual(["A"]);
    expect([...adj.get("D")!]).toEqual([]); // isolated
    expect(adj.has("C")).toBe(false); // not an Asian node
  });
});

describe("BuildGraph.build", () => {
  it("makes every feature-bearing country placeable, including isolated ones", () => {
    const { all } = fixture();
    const m = BuildGraph.build(all, "Asia");
    const ids = m.placeable.map((c) => c.id).sort();
    expect(ids).toEqual(["A", "B", "D"]); // E excluded (no feature), D included (isolated)
    expect(m.buildable).toBe(true);
    expect(m.islands).toEqual([]);
  });

  it("is not buildable with fewer than three placeable countries", () => {
    const A = mk("A", "Africa");
    const B = mk("B", "Africa");
    const m = BuildGraph.build([A, B], "Africa");
    expect(m.buildable).toBe(false);
  });

  it("supports Oceania", () => {
    const o = ["O1", "O2", "O3"].map((id) => mk(id, "Oceania"));
    const m = BuildGraph.build(o, "Oceania");
    expect(m.supported).toBe(true);
    expect(m.buildable).toBe(true);
    expect(m.placeable).toHaveLength(3);
  });

  it("yields nothing for an unsupported region", () => {
    const m = BuildGraph.build([mk("X", "Antarctic")], "Antarctic");
    expect(m.supported).toBe(false);
    expect(m.buildable).toBe(false);
    expect(m.placeable).toEqual([]);
  });
});

describe("BuildGraph.isUnlocked", () => {
  it("is true when a country borders something already placed", () => {
    const { A, B, D, all } = fixture();
    const adj = BuildGraph.adjacency(all, "Asia");
    const placed = new Set(["A"]);
    expect(BuildGraph.isUnlocked(B, placed, adj)).toBe(true); // B borders A
    expect(BuildGraph.isUnlocked(D, placed, adj)).toBe(false); // isolated
    expect(BuildGraph.isUnlocked(A, placed, adj)).toBe(false); // already placed
  });
});
