/**
 * Field Atlas palette, ported for the TV app.
 *
 * Single source of truth for the TV colours. Every value is copied verbatim
 * from the web app's `:root` CSS variables in `apps/web/app/globals.css` — the
 * comment on each line names the source variable. Keep them in sync by hand;
 * there is no CSS-variable machinery on native.
 */
export const theme = {
  sea: "#0a1828", //  --map-sea   (deep navy the map floats on)
  land: "#2a3157", //  --map-land  (unhighlighted country fill)
  landStroke: "#0e1f33", //  --bg    (page navy, used as land hairline)
  parchment: "#f4ecda", //  --paper (surface cards)
  parchment2: "#fbf6ea", //  --paper-2 (lighter — raised inputs)
  parchmentInset: "#ece2cc", //  --paper-inset (recessed seg tracks/fields)
  ink: "#1b2a40", //  --ink   (text on parchment)
  inkDim: "#5f5743", //  --ink-dim
  inkFaint: "#8a7d63", //  --ink-faint
  cream: "#ede4d1", //  --cream (text on navy)
  creamDim: "#a7b1c0", //  --cream-dim
  brass: "#b0762b", //  --accent  (brass)
  forest: "#2f5e4c", //  --accent-2 (forest)
  oxblood: "#8c3b2b", //  --accent-3 (oxblood)
  good: "#2f6f4e", //  --good
  bad: "#a6402c", //  --bad
  target: "#b0762b", //  --warn / target highlight (brass)
  bg: "#0e1f33", //  --bg    (page navy)
  bg2: "#10243b", //  --bg-2
  stroke: "#dccca9", //  --stroke (hairline on parchment)
  hair: "#c7b489", //  --hair  (stronger hairline)
} as const;

export type Theme = typeof theme;
