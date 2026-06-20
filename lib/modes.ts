import type { Mode, ModeId } from "./types";

/**
 * The six modes, in three groups. Picking from one group clears the others;
 * `Logic.sanitizeModes` coerces any saved set down to a single group.
 */
export const MODES: Record<ModeId, Mode> = {
  find:    { id: "find",    label: "Find on map",       group: "map",    map: true,  short: "Find" },
  name:    { id: "name",    label: "Name the country",  group: "map",    map: true,  short: "Name" },
  capital: { id: "capital", label: "Capital",           group: "expert", map: false, short: "Capital" },
  flag:    { id: "flag",    label: "Flag",              group: "expert", map: false, short: "Flag" },
  border:  { id: "border",  label: "Borders",           group: "expert", map: false, short: "Borders" },
  build:   { id: "build",   label: "Build a continent", group: "build",  map: false, short: "Build" },
};

// Non-UN states we still want as sovereign quiz items (cca3). Kosovo is "UNK"
// in the mledoze dataset (not XKX); Taiwan "TWN"; Vatican is already unMember.
export const EXTRA_SOVEREIGN = new Set(["TWN", "UNK", "PSE"]);
