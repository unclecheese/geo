import { Logic } from "./logic";
import type { Country } from "./types";

export interface SuggestOpts {
  limit?: number;
  capital?: boolean;
}

/**
 * Rank a country pool against a typed query for autocomplete. Prefix matches on
 * the normalised name (or capital, with `opts.capital`) come first in pool
 * order; the remainder is then filled with the levenshtein-nearest countries so
 * a misspelling ("zeeland") still surfaces the intended answer ("New Zealand").
 * Empty / whitespace query → []. Shared by TV's TypedAnswer and web's
 * Autocomplete so both platforms rank identically.
 */
export function suggest(query: string, pool: Country[], opts: SuggestOpts = {}): Country[] {
  const q = Logic.normalize(query);
  if (!q) return [];
  const limit = opts.limit ?? 4;
  const field = (c: Country) => (opts.capital ? c.capital : c.name) || "";

  const prefix: Country[] = [];
  const rest: Country[] = [];
  for (const c of pool) {
    const nc = Logic.normalize(field(c));
    if (!nc) continue;
    if (nc.startsWith(q)) prefix.push(c);
    else rest.push(c);
  }

  if (prefix.length >= limit) return prefix.slice(0, limit);

  // Fill the tail with the closest non-prefix candidates by edit distance.
  const ranked = rest
    .map((c) => ({ c, d: Logic.levenshtein(q, Logic.normalize(field(c))) }))
    .sort((a, b) => a.d - b.d)
    .map((x) => x.c);

  return prefix.concat(ranked).slice(0, limit);
}
