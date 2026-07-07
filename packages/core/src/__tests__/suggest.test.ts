import { describe, it, expect } from "vitest";
import { suggest } from "../suggest";
import type { Country } from "../types";

// Minimal Country-likes — suggest only reads `name` and `capital`.
function c(name: string, capital?: string): Country {
  return { id: name, name, cca3: null, region: "", neighbours: [], capital } as Country;
}

const POOL: Country[] = [
  c("New Zealand", "Wellington"),
  c("Netherlands", "Amsterdam"),
  c("Nepal", "Kathmandu"),
  c("Nigeria", "Abuja"),
  c("Norway", "Oslo"),
  c("Côte d'Ivoire", "Yamoussoukro"),
  c("Australia", "Canberra"),
  c("Brazil", "Brasília"),
];

const names = (out: Country[]) => out.map((x) => x.name);

describe("suggest", () => {
  it("prefix matches rank first (new z → New Zealand first)", () => {
    const out = suggest("new z", POOL);
    expect(out[0].name).toBe("New Zealand");
  });

  it("surfaces a near-miss via levenshtein when nothing prefix-matches (zeeland → New Zealand)", () => {
    const out = suggest("zeeland", POOL);
    expect(names(out)).toContain("New Zealand");
  });

  it("folds diacritics through Logic.normalize (cote d → Côte d'Ivoire)", () => {
    const out = suggest("cote d", POOL);
    expect(out[0].name).toBe("Côte d'Ivoire");
  });

  it("ranks by capital when opts.capital (welling → New Zealand)", () => {
    const out = suggest("welling", POOL, { capital: true });
    expect(out[0].name).toBe("New Zealand");
  });

  it("respects the limit (default 4)", () => {
    expect(suggest("n", POOL).length).toBeLessThanOrEqual(4);
    expect(suggest("n", POOL, { limit: 2 }).length).toBe(2);
  });

  it("returns [] for empty / blank query", () => {
    expect(suggest("", POOL)).toEqual([]);
    expect(suggest("   ", POOL)).toEqual([]);
  });
});
