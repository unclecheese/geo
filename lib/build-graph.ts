import type { Country } from "./types";

export interface BuildModel {
  continent: string;
  supported: boolean;
  buildable: boolean;
  adjacency: Map<string, Set<string>>;
  placeable: Country[];
  islands: Country[];
}

/**
 * Pure graph logic for the Continent Builder: same-continent land-border
 * adjacency, the placeable set, and the unlock predicate. No DOM, no D3.
 */
export const BuildGraph = {
  // Continents you can assemble. Placement no longer requires a country to
  // touch the map, so island continents (Oceania) and isolated nations work too.
  SUPPORTED: ["Africa", "Asia", "Europe", "Americas", "Oceania"] as const,

  // Same-continent land-border adjacency as id -> Set(id). Only edges where
  // both endpoints sit in the chosen continent are kept.
  adjacency(countries: Country[], continent: string): Map<string, Set<string>> {
    const inC = countries.filter((c) => c.region === continent);
    const ids = new Set(inC.map((c) => c.id));
    const adj = new Map<string, Set<string>>();
    for (const c of inC) adj.set(c.id, new Set());
    for (const c of inC) {
      for (const n of c.neighbours) {
        if (ids.has(n.id)) {
          adj.get(c.id)!.add(n.id);
          adj.get(n.id)!.add(c.id);
        }
      }
    }
    return adj;
  },

  // Connected components (arrays of country objects), largest first.
  components(countries: Country[], continent: string): Country[][] {
    const inC = countries.filter((c) => c.region === continent);
    const byId = new Map(inC.map((c) => [c.id, c]));
    const adj = this.adjacency(countries, continent);
    const seen = new Set<string>();
    const comps: Country[][] = [];
    for (const c of inC) {
      if (seen.has(c.id)) continue;
      const stack = [c.id];
      const group: Country[] = [];
      seen.add(c.id);
      while (stack.length) {
        const id = stack.pop()!;
        group.push(byId.get(id)!);
        for (const nb of adj.get(id)!) if (!seen.has(nb)) { seen.add(nb); stack.push(nb); }
      }
      comps.push(group);
    }
    comps.sort((a, b) => b.length - a.length);
    return comps;
  },

  // Full build model for a continent: the adjacency (used as a snap bonus when
  // a piece is dropped against a neighbour already on the map) and the placeable
  // set — every country in the continent that has a polygon to render. Islands
  // and otherwise-disconnected nations are included; they snap by position.
  build(countries: Country[], continent: string): BuildModel {
    const adj = this.adjacency(countries, continent);
    const supported = (this.SUPPORTED as readonly string[]).includes(continent);
    const placeable = supported
      ? countries.filter((c) => c.region === continent && c.feature)
      : [];
    const buildable = supported && placeable.length >= 3;
    return { continent, supported, buildable, adjacency: adj, placeable, islands: [] };
  },

  // A not-yet-placed country borders something already on the map. Used as the
  // border-snap bonus signal (placement no longer *requires* it).
  isUnlocked(
    country: Country | null | undefined,
    placedIds: Set<string>,
    adjacency: Map<string, Set<string>>
  ): boolean {
    if (!country || placedIds.has(country.id)) return false;
    const nb = adjacency.get(country.id);
    if (!nb) return false;
    for (const id of nb) if (placedIds.has(id)) return true;
    return false;
  },
};
