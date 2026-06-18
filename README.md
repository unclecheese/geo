# Atlas — Geography Trainer

A beautiful, single-file geography learning tool. Open `index.html` in a browser — no
build, no install.

## What it does

- **Interactive world map** (Equal Earth projection) with smooth zoom/pan.
  - Single-click selects a country, double-click centres + zooms, `Esc` resets to the
    world view, scroll/drag to navigate.
  - Microstates get clickable marker dots and enlarged hit areas.
- **Five quiz modes:** find a country on the map, country → capital, flag → country,
  name the highlighted country, and "click every neighbour" border drills.
- **Spaced repetition** (Leitner boxes) remembers what you struggle with and resurfaces
  weak items; mastered items fade out.
- **Region filters** by continent and UN subregion.
- **Score, accuracy, streaks, and response time** tracked automatically; optional timed
  challenge.
- **Mastery heatmap** tints countries red → green by how well you know them.
- **Stats dashboard** with weakest items, per-region accuracy, and trends.
- Progress auto-saves to `localStorage`, with JSON **export/import** for backup.

## Running

Just open `index.html`. It needs an internet connection on first load to fetch map
geometry, country metadata, and flags; everything is cached afterwards.

## Tech

Single HTML file with inline JS/CSS. D3 v7 + TopoJSON (`world-atlas` countries-50m) for
the map, country metadata from the mledoze/countries dataset, flags from flagcdn.
