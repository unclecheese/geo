// Browser-only D3 continent builder singleton. React owns the DOM element refs;
// D3 owns everything inside them. Import only from client components / client-only code.
import {
  select,
  geoEqualEarth,
  geoMercator,
  geoPath,
  geoArea,
  geoCentroid,
  zoom,
  zoomIdentity,
  pointer,
  easeCubicOut,
} from "d3";
import type { Selection, ZoomBehavior, ZoomTransform } from "d3";
import { merge as topoMerge } from "topojson-client";
import { DataLayer } from "@/lib/data-layer";
import { Logic } from "@/lib/logic";
import { Audio2 } from "@/lib/fx";
import { Placement } from "@/lib/placement";
import { europeanRussia, ukraineWithCrimea, crimeaPolygon, RU_CCN3, UA_CCN3 } from "@/lib/ru-fix";
import { useAtlasStore } from "@/store/atlas-store";
import type { Country } from "@/lib/types";
import type { Feature, FeatureCollection } from "geojson";

type SVGSel = Selection<SVGSVGElement, unknown, null, undefined>;
type GSel = Selection<SVGGElement, unknown, null, undefined>;

// Pixels reserved on the left edge for the country bank (panel width + gutter).
const BANK_RESERVE = 280;

// A broad, vivid palette for the country tapestry. Graph-coloured against the
// border adjacency so no two neighbours share one — duplicates only ever appear
// far apart.
const BUILD_PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e", "#fb7185",
  "#fbbf24", "#34d399", "#60a5fa", "#c084fc", "#f472b6", "#2dd4bf",
];

export interface BuildModel {
  continent: string;
  graph: import("@/lib/build-graph").BuildModel;
  seed: Country | null;
  placedIds: Set<string>;
  revealedIds: Set<string>;
}

interface DragState {
  country: Country;
  tile: HTMLElement;
  trueCentroid: [number, number];
  el: Selection<SVGPathElement, unknown, null, undefined>;
}

export const BuildView = {
  svg: null as SVGSel | null,
  g: null as GSel | null,
  gSil: null as GSel | null,
  gPlaced: null as GSel | null,
  gLabels: null as GSel | null,
  gDrag: null as GSel | null,
  path: null as ReturnType<typeof geoPath> | null,
  projection: null as ReturnType<typeof geoEqualEarth> | null,
  zoom: null as ZoomBehavior<SVGSVGElement, unknown> | null,
  transform: zoomIdentity as ZoomTransform,
  width: 0,
  height: 0,
  model: null as BuildModel | null,
  fieldBounds: null as [[number, number], [number, number]] | null,
  extent: 0,
  centroidRadius: 0,
  // Continent-specific geometry overrides (e.g. European Russia, Ukraine+Crimea).
  _override: new Map<string, Feature>(),
  // Per-country tapestry colour, graph-coloured against border adjacency.
  _colourMap: new Map<string, string>(),
  drag: null as DragState | null,
  _inited: false,
  _naming: false,

  // Stored bound handlers for cleanup.
  _onPointerMove: null as ((ev: PointerEvent) => void) | null,
  _onPointerUp: null as ((ev: PointerEvent) => void) | null,
  _onPointerCancel: null as (() => void) | null,
  _onMouseUp: null as (() => void) | null,

  // Callbacks wired by the store — avoids circular import (build-view must NOT
  // import build-store at module level).
  onPlace: null as ((country: Country) => void) | null,
  onMistake: null as (() => void) | null,
  onHint: null as ((country: Country) => void) | null,

  // DOM refs passed in from the React component.
  _svgEl: null as SVGSVGElement | null,
  _wrapEl: null as HTMLElement | null,
  _bankEl: null as HTMLElement | null,
  _timerEl: null as HTMLElement | null,
  _subEl: null as HTMLElement | null,
  _nameEl: null as HTMLElement | null,
  _nameHostEl: null as HTMLElement | null,

  init(
    svgEl: SVGSVGElement,
    wrapEl: HTMLElement,
    bankEl: HTMLElement,
    timerEl: HTMLElement,
    subEl: HTMLElement,
    nameEl: HTMLElement,
    nameHostEl: HTMLElement
  ) {
    if (this._inited) this.destroy();

    this._svgEl = svgEl;
    this._wrapEl = wrapEl;
    this._bankEl = bankEl;
    this._timerEl = timerEl;
    this._subEl = subEl;
    this._nameEl = nameEl;
    this._nameHostEl = nameHostEl;

    this.width = wrapEl.clientWidth;
    this.height = wrapEl.clientHeight;

    this.svg = select(svgEl).attr("viewBox", [0, 0, this.width, this.height].join(" "));
    this.svg.selectAll("*").remove();

    // Ocean background (fixed; outside the zoomed group).
    this.svg
      .append("rect")
      .attr("width", this.width)
      .attr("height", this.height)
      .attr("fill", "var(--map-sea)");

    this.g = this.svg.append("g").attr("class", "build-world");
    this.gSil = this.g.append("g");
    this.gPlaced = this.g.append("g");
    this.gLabels = this.g.append("g");
    this.gDrag = this.g.append("g");

    this.transform = zoomIdentity;
    this._setupZoom();
    this._wireDrag();
    this._inited = true;
  },

  _setupZoom() {
    this.zoom = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .translateExtent([
        [0, 0],
        [this.width, this.height],
      ])
      .on("zoom", (ev) => {
        this.transform = ev.transform;
        this.g!.attr("transform", String(ev.transform));
        this._applyZoomScale();
      });

    this.svg!.call(this.zoom!).on("dblclick.zoom", null);

    this.svg!.on("dblclick", (ev: MouseEvent) => {
      const [mx, my] = pointer(ev, this.svg!.node()!);
      this.zoomToPoint(mx, my, 3);
    });

    this.svg!.on("mousedown.cursor", () => {
      this._svgEl?.classList.add("grabbing");
    });

    this._onMouseUp = () => {
      this._svgEl?.classList.remove("grabbing");
    };
    window.addEventListener("mouseup", this._onMouseUp);
  },

  zoomToPoint(mx: number, my: number, k = 3) {
    const t = zoomIdentity
      .translate(this.width / 2, this.height / 2)
      .scale(k)
      .translate(-mx, -my);
    this.svg!.transition().duration(600).call(this.zoom!.transform, t);
  },

  resetZoom() {
    if (this.svg && this.zoom) {
      this.svg.transition().duration(500).call(this.zoom.transform, zoomIdentity);
    }
  },

  _svgPoint(ev: PointerEvent): [number, number] {
    const r = this._wrapEl!.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  },

  _localPoint(ev: PointerEvent): [number, number] {
    const p = this._svgPoint(ev);
    return this.transform.invert(p) as [number, number];
  },

  _applyZoomScale() {
    const k = this.transform ? this.transform.k : 1;
    this.gLabels!.selectAll<SVGTextElement, unknown>("text").style(
      "font-size",
      12 / k + "px"
    );
  },

  // Show the builder for a given model — measures the container, renders the
  // silhouette, and populates the bank. Called after init() each game.
  show(model: BuildModel) {
    this.model = model;
    this._assignColours();
    this._render();
    this.renderBank();
  },

  _hash(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return h;
  },

  // Greedy graph-colouring over the border adjacency: each country takes the
  // least-used palette colour not worn by a placed neighbour. Highest-degree
  // countries are coloured first (the classic Welsh–Powell ordering), and ties
  // start from an id-hashed offset so the spread looks varied, not banded.
  _assignColours() {
    this._colourMap = new Map<string, string>();
    if (!this.model) return;
    const adj = this.model.graph.adjacency;
    const counts = new Map<string, number>(BUILD_PALETTE.map((c) => [c, 0]));
    const order = this.model.graph.placeable
      .slice()
      .sort((a, b) => (adj.get(b.id)?.size || 0) - (adj.get(a.id)?.size || 0));
    for (const c of order) {
      const taken = new Set<string>();
      const nb = adj.get(c.id);
      if (nb) for (const id of nb) { const col = this._colourMap.get(id); if (col) taken.add(col); }
      const start = this._hash(c.id) % BUILD_PALETTE.length;
      let best = BUILD_PALETTE[start], bestCount = Infinity;
      for (let k = 0; k < BUILD_PALETTE.length; k++) {
        const col = BUILD_PALETTE[(start + k) % BUILD_PALETTE.length];
        if (taken.has(col)) continue;
        const cnt = counts.get(col)!;
        if (cnt < bestCount) { best = col; bestCount = cnt; }
      }
      this._colourMap.set(c.id, best);
      counts.set(best, (counts.get(best) || 0) + 1);
    }
  },

  // Build the continent-specific geometry overrides. For Europe: Russia is
  // clipped to its European part (west of the Urals) and Crimea is moved from
  // Russia onto Ukraine. Other continents have no overrides.
  _buildOverrides() {
    this._override = new Map<string, Feature>();
    if (!this.model || this.model.continent !== "Europe") return;
    const ru = DataLayer.byCcn3.get(RU_CCN3);
    const ua = DataLayer.byCcn3.get(UA_CCN3);
    if (ru?.feature) this._override.set(ru.id, europeanRussia(ru.feature));
    if (ua?.feature && ru?.feature) this._override.set(ua.id, ukraineWithCrimea(ua.feature, ru.feature));
  },

  _render() {
    if (!this.model || !this.svg) return;
    const topo = DataLayer.topo as never; // Topo type is internal to data-layer
    if (!topo) return;

    this._buildOverrides();

    // Frame on main landmasses only (displayFeature) so Hawaii/Aleutians
    // don't shrink the whole continent. Measured before enlargement so a blown-up
    // microstate can't expand the frame.
    const displayFeatures = this.model.graph.placeable
      .filter((c) => c.feature)
      .map((c) => this._displayFeature(c));
    const displayColl: FeatureCollection = {
      type: "FeatureCollection",
      features: displayFeatures,
    };

    // Reserve room on the LEFT for the country bank; inset the rest.
    this.projection = geoEqualEarth().fitExtent(
      [
        [BANK_RESERVE, 30],
        [Math.max(BANK_RESERVE + 130, this.width - 30), this.height - 30],
      ],
      displayColl
    );
    this.path = geoPath(this.projection);

    const b = this.path.bounds(displayColl);
    this.fieldBounds = b as [[number, number], [number, number]];
    this.extent = Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]);
    this.centroidRadius = 0.05 * this.extent;

    // Enlarge any country too small to drop onto (e.g. Vatican, sub-pixel inside
    // Rome). Scaled about its own centroid so its true position is unchanged.
    const enlarged = this._enlargeTinyCountries();

    // Dissolve the placeable set into one silhouette — excluding countries we
    // draw with custom geometry (clipped Russia, the enlarged microstates),
    // which topojson.merge can't see. Ukraine stays in the merge; its Crimea is
    // drawn as a separate sliver below.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geoms = (topo as any).objects.countries.geometries as Array<{ id: string | number }>;
    const placeableCcn3 = new Set(
      this.model.graph.placeable.map((c) => c.ccn3).filter(Boolean)
    );
    const silExclude = new Set<string>(
      [...enlarged].map((id) => DataLayer.byCcn3.get(id)?.ccn3).filter(Boolean) as string[]
    );
    const ru = DataLayer.byCcn3.get(RU_CCN3);
    if (this.model.continent === "Europe" && ru?.ccn3) silExclude.add(ru.ccn3);

    const memberGeoms = geoms.filter(
      (g) => placeableCcn3.has(DataLayer.pad3(g.id)) && !silExclude.has(DataLayer.pad3(g.id))
    );
    const merged = topoMerge(topo, memberGeoms as never);

    // Custom silhouette outlines: European Russia + the Crimea sliver, plus the
    // enlarged microstates, so the backdrop matches the pieces you place.
    const extraSil: Feature[] = [...enlarged].map((id) => this._override.get(id)!).filter(Boolean);
    if (this.model.continent === "Europe") {
      const ruFeat = this._override.get(RU_CCN3);
      if (ruFeat) extraSil.push(ruFeat);
      const crimea = ru?.feature ? crimeaPolygon(ru.feature) : null;
      if (crimea) extraSil.push({ type: "Feature", properties: null, geometry: { type: "Polygon", coordinates: crimea } });
    }

    this.gSil!.selectAll("path")
      .data([merged, ...extraSil])
      .join("path")
      .attr("class", "build-silhouette")
      .attr("d", this.path as never);

    this._redrawPlaced();
  },

  // Blow up any placeable country whose projected footprint is smaller than a
  // comfortably-draggable size, scaling about its centroid (true position kept).
  // Records the enlarged feature in _override and returns the set of ids touched.
  _enlargeTinyCountries(): Set<string> {
    const MIN_PX = 24; // minimum on-screen diagonal for a piece you can target
    const enlarged = new Set<string>();
    if (!this.path) return enlarged;
    for (const c of this.model!.graph.placeable) {
      if (!c.feature || this._override.has(c.id)) continue;
      const disp = this._displayFeature(c);
      const bb = this.path.bounds(disp);
      const dpx = Math.hypot(bb[1][0] - bb[0][0], bb[1][1] - bb[0][1]);
      if (isFinite(dpx) && dpx > 0 && dpx < MIN_PX) {
        this._override.set(c.id, this._scaleFeature(disp, MIN_PX / dpx));
        enlarged.add(c.id);
      }
    }
    return enlarged;
  },

  // Scale a feature's geometry about its geographic centroid by `factor`.
  _scaleFeature(feature: Feature, factor: number): Feature {
    const [cx, cy] = geoCentroid(feature);
    const scaleRing = (ring: number[][]) =>
      ring.map(([x, y]) => [cx + (x - cx) * factor, cy + (y - cy) * factor]);
    const g = feature.geometry;
    let geometry = g;
    if (g.type === "Polygon") {
      geometry = { type: "Polygon", coordinates: g.coordinates.map(scaleRing) };
    } else if (g.type === "MultiPolygon") {
      geometry = { type: "MultiPolygon", coordinates: g.coordinates.map((p) => p.map(scaleRing)) };
    }
    return { type: "Feature", id: feature.id, properties: feature.properties, geometry };
  },

  // Main landmass only — drops polygons smaller than ~18% of the largest.
  // Cached per country on country._display. Overridden geometry (European
  // Russia, Ukraine+Crimea) is returned as-is — it is already curated.
  _displayFeature(country: Country): Feature {
    const ov = this._override.get(country.id);
    if (ov) return ov;
    const c = country as Country & { _display?: Feature };
    if (c._display) return c._display;
    const f = country.feature!;
    const g = f.geometry;
    if (!g || g.type !== "MultiPolygon" || g.coordinates.length <= 1) {
      c._display = f;
      return f;
    }
    const areas = g.coordinates.map((poly) =>
      geoArea({ type: "Feature", geometry: { type: "Polygon", coordinates: poly }, properties: null })
    );
    const max = Math.max(...areas);
    const kept = g.coordinates.filter((_, i) => areas[i] >= 0.18 * max);
    c._display = {
      type: "Feature",
      properties: f.properties,
      geometry: { type: "MultiPolygon", coordinates: kept },
    };
    return c._display;
  },

  // Graph-coloured tapestry colour (assigned in _assignColours). Falls back to a
  // hashed palette entry for any country not in the current model.
  _colour(country: Country): string {
    return (
      this._colourMap.get(country.id) ||
      BUILD_PALETTE[this._hash(String(country.id)) % BUILD_PALETTE.length]
    );
  },

  // Project a feature's coordinate rings into pixel space, optionally offset.
  _projectRings(
    feature: Feature,
    dx = 0,
    dy = 0
  ): [number, number][][] {
    const proj = this.projection!;
    const geom = feature.geometry;
    const polys =
      geom.type === "Polygon"
        ? [geom.coordinates]
        : geom.type === "MultiPolygon"
        ? geom.coordinates
        : [];
    const rings: [number, number][][] = [];
    for (const poly of polys) {
      for (const ring of poly) {
        rings.push(
          ring.map((pt) => {
            const p = proj(pt as [number, number])!;
            return [p[0] + dx, p[1] + dy];
          })
        );
      }
    }
    return rings;
  },

  _placedFeatures(): Country[] {
    if (!this.model) return [];
    return this.model.graph.placeable.filter(
      (c) => this.model!.placedIds.has(c.id) && c.feature
    );
  },

  _redrawPlaced() {
    if (!this.model || !this.gPlaced || !this.path) return;
    const placed = this._placedFeatures();
    const seedId = this.model.seed ? this.model.seed.id : null;
    this.gPlaced
      .selectAll<SVGPathElement, Country>("path")
      .data(placed, (d) => d.id)
      .join("path")
      .attr("class", (d) => (d.id === seedId ? "build-seed" : "build-placed"))
      .style("fill", (d) => (d.id === seedId ? null : this._colour(d)))
      .attr("d", (d) => this.path!(this._displayFeature(d)));

    const revealed = this.model.revealedIds || new Set<string>();
    const labelled = placed.filter(
      (c) => c.id === seedId || revealed.has(c.id)
    );
    this.gLabels!.selectAll<SVGTextElement, Country>("text")
      .data(labelled, (d) => d.id)
      .join("text")
      .attr("class", "build-seed-label")
      .attr("x", (d) => this.path!.centroid(this._displayFeature(d))[0])
      .attr("y", (d) => this.path!.centroid(this._displayFeature(d))[1] + 4)
      .text((d) => d.name);

    this._applyZoomScale();
  },

  // Bank: all remaining (unplaced) countries with polygon geometry.
  renderBank() {
    if (!this.model || !this._bankEl) return;
    this._bankEl.innerHTML = "";
    const remaining = this.model.graph.placeable.filter(
      (c) => !this.model!.placedIds.has(c.id) && c.feature
    );
    const showNames = useAtlasStore.getState().settings.buildDifficulty === "easy";
    const ordered = showNames
      ? remaining.slice().sort((a, b) => a.name.localeCompare(b.name))
      : Logic._shuffle(remaining.slice());
    for (const c of ordered) this._bankEl.appendChild(this._makeTile(c));
    this._updateBanner();
  },

  _updateBanner() {
    if (!this.model || !this._subEl) return;
    const total = this.model.graph.placeable.length;
    this._subEl.textContent = `${this.model.placedIds.size} / ${total} placed`;
  },

  _makeTile(country: Country): HTMLElement {
    const tile = document.createElement("button");
    tile.className = "build-tile";
    tile.dataset.id = country.id;
    const showNames = useAtlasStore.getState().settings.buildDifficulty === "easy";
    tile.innerHTML =
      `<span class="tile-hint" role="button" tabindex="0" title="Stuck? Reveal its spot" aria-label="Reveal location">?</span>` +
      this._tileSVG(country) +
      (showNames
        ? `<div class="tname">${country.name}</div>`
        : `<div class="tname tname-hidden">·</div>`);

    tile.addEventListener("pointerdown", (ev) =>
      this._startDrag(ev, country, tile)
    );
    const hint = tile.querySelector<HTMLElement>(".tile-hint")!;
    hint.addEventListener("pointerdown", (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
    });
    hint.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (this.onHint) this.onHint(country);
    });
    return tile;
  },

  // Normalised silhouette in a 58x54 tile SVG, tinted with the country's colour.
  _tileSVG(country: Country): string {
    const f = this._displayFeature(country);
    const proj = geoMercator().fitExtent([[5, 5], [53, 49]], f);
    const p = geoPath(proj);
    const col = this._colour(country);
    const d = p(f) || "";
    return `<svg viewBox="0 0 58 54" aria-hidden="true"><path class="build-tile-shape" style="fill:${col}" d="${d}"/></svg>`;
  },

  /* --- drag layer (pointer events) --- */
  _wireDrag() {
    this._onPointerMove = (ev: PointerEvent) => this._moveDrag(ev);
    this._onPointerUp = (ev: PointerEvent) => this._endDrag(ev);
    this._onPointerCancel = () => this._cancelDrag();
    window.addEventListener("pointermove", this._onPointerMove);
    window.addEventListener("pointerup", this._onPointerUp);
    window.addEventListener("pointercancel", this._onPointerCancel);
  },

  _startDrag(ev: PointerEvent, country: Country, tile: HTMLElement) {
    if (!country.feature || this.drag || this._naming) return;
    ev.preventDefault();
    const disp = this._displayFeature(country);
    const trueCentroid = this.path!.centroid(disp) as [number, number];
    const el = this.gDrag!.append<SVGPathElement>("path")
      .attr("class", "build-drag-piece")
      .style("fill", this._colour(country))
      .attr("d", this.path!(disp));
    this.drag = { country, tile, trueCentroid, el };
    tile.classList.add("dragging");
    this._moveDrag(ev);
  },

  _moveDrag(ev: PointerEvent) {
    if (!this.drag) return;
    const [x, y] = this._localPoint(ev);
    const [tx, ty] = this.drag.trueCentroid;
    this.drag.el.attr("transform", `translate(${x - tx},${y - ty})`);
  },

  _cancelDrag() {
    if (!this.drag) return;
    this.drag.tile.classList.remove("dragging");
    this.drag.el.remove();
    this.drag = null;
  },

  // True when the pointer was released anywhere over the bank panel (screen
  // space) — used to treat a drop-back-on-the-bank as a cancel even when the
  // map is zoomed in.
  _overBank(ev: PointerEvent): boolean {
    if (!this._bankEl) return false;
    const r = this._bankEl.getBoundingClientRect();
    return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
  },

  _endDrag(ev: PointerEvent) {
    if (!this.drag) return;
    const { country, tile, trueCentroid, el } = this.drag;
    this.drag = null;
    tile.classList.remove("dragging");

    // Dropped back over the bank → always a cancel, no penalty.
    if (this._overBank(ev)) {
      this._cancelReturn(tile, trueCentroid, el);
      return;
    }

    const [x, y] = this._localPoint(ev);
    const disp = this._displayFeature(country);
    // Piece outline at its true position, and how far the drop missed by.
    const trueRings = this._projectRings(disp);
    const offset: [number, number] = [x - trueCentroid[0], y - trueCentroid[1]];

    const pieceDiag = Placement.diag(trueRings);
    const result = Placement.validate({
      pieceRings: trueRings,
      offset,
      requiredOverlap: Placement.requiredOverlap(pieceDiag, this.extent),
      minAbsTol: 3,
    });

    if (result.ok) {
      el.remove();
      this._place(country, tile);
      return;
    }

    // Inside the continent's field → wrong placement (mistake).
    // Outside the field → silent cancel (change of mind, no penalty).
    if (this._inField([x, y])) {
      this._reject(tile, trueCentroid, el);
    } else {
      this._cancelReturn(tile, trueCentroid, el);
    }
  },

  _inField(p: [number, number]): boolean {
    const b = this.fieldBounds;
    if (!b) return true;
    const m = this.centroidRadius || 0;
    return (
      p[0] >= b[0][0] - m &&
      p[0] <= b[1][0] + m &&
      p[1] >= b[0][1] - m &&
      p[1] <= b[1][1] + m
    );
  },

  _returnPiece(
    tile: HTMLElement,
    trueCentroid: [number, number],
    el: Selection<SVGPathElement, unknown, null, undefined>,
    ms: number
  ) {
    const r = tile.getBoundingClientRect();
    const wrap = this._wrapEl!.getBoundingClientRect();
    const [tx, ty] = this.transform.invert([
      r.left + r.width / 2 - wrap.left,
      r.top + r.height / 2 - wrap.top,
    ]) as [number, number];
    el
      .transition()
      .duration(ms)
      .ease(easeCubicOut)
      .attr("transform", `translate(${tx - trueCentroid[0]},${ty - trueCentroid[1]})`)
      .style("opacity", 0)
      .remove();
  },

  _reject(
    tile: HTMLElement,
    trueCentroid: [number, number],
    el: Selection<SVGPathElement, unknown, null, undefined>
  ) {
    this._returnPiece(tile, trueCentroid, el, 360);
    tile.classList.remove("reject");
    void tile.offsetWidth; // restart CSS animation
    tile.classList.add("reject");
    setTimeout(() => tile.classList.remove("reject"), 450);
    Audio2.misplace();
    if (this.onMistake) this.onMistake();
  },

  _cancelReturn(
    tile: HTMLElement,
    trueCentroid: [number, number],
    el: Selection<SVGPathElement, unknown, null, undefined>
  ) {
    this._returnPiece(tile, trueCentroid, el, 280);
  },

  _place(country: Country, tile: HTMLElement) {
    this.model!.placedIds.add(country.id);
    tile.remove();
    this._redrawPlaced();
    this._updateBanner();
    Audio2.place();
    if (this.onPlace) this.onPlace(country);
  },

  // Reveal a hinted country: remove its tile, add it to placedIds, flash it.
  revealPlace(country: Country) {
    const tile = this._bankEl?.querySelector<HTMLElement>(
      `.build-tile[data-id="${country.id}"]`
    );
    if (tile) tile.remove();
    this._redrawPlaced();
    this._updateBanner();
    const p = this.gPlaced!
      .selectAll<SVGPathElement, Country>("path")
      .filter((d) => d.id === country.id);
    p.interrupt()
      .attr("stroke", "#fbbf24")
      .attr("stroke-opacity", "1")
      .attr("stroke-width", "2.5")
      .transition()
      .duration(900)
      .attr("stroke", "rgba(255,255,255,.55)")
      .attr("stroke-opacity", "1")
      .attr("stroke-width", ".5");
  },

  // Generic credit prompt: shows a labelled inline autocomplete over `candidates`
  // and calls onSubmit(typed) once (Enter / pick / Skip).
  showPrompt(label: string, candidates: string[], onSubmit: (typed: string) => void) {
    if (!this._nameEl || !this._nameHostEl) return;
    const lbl = this._nameEl.querySelector(".bn-prompt");
    if (lbl) lbl.textContent = label;
    this._nameHostEl.innerHTML = "";
    this._nameEl.hidden = false;
    this._naming = true;
    this._buildAutocomplete(this._nameHostEl, candidates, (v) => onSubmit(v));
  },

  // Name-for-credit prompt (hard/expert) — the country you just placed.
  showNamePrompt(onSubmit: (typed: string) => void) {
    if (!this.model) return;
    const names = [...new Set(this.model.graph.placeable.map((c) => c.name))];
    this.showPrompt("Name the country you just placed", names, onSubmit);
  },

  // Capital prompt (expert) — the capital of the country just placed.
  showCapitalPrompt(onSubmit: (typed: string) => void) {
    if (!this.model) return;
    const capitals = [
      ...new Set(
        this.model.graph.placeable
          .map((c) => c.capital)
          .filter((c): c is string => !!c && c !== "—")
      ),
    ];
    this.showPrompt("And its capital?", capitals, onSubmit);
  },

  hideNamePrompt() {
    if (!this._nameEl || !this._nameHostEl) return;
    this._nameEl.hidden = true;
    this._nameHostEl.innerHTML = "";
    this._naming = false;
  },

  // Inline autocomplete (mirrors UI._buildAutocomplete from index.html).
  _buildAutocomplete(host: HTMLElement, candidates: string[], onSubmit: (v: string) => void) {
    const wrap = document.createElement("div");
    wrap.className = "ac";
    const input = document.createElement("input");
    input.className = "ac-input";
    input.type = "text";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.placeholder = "Type your answer…";
    const list = document.createElement("div");
    list.className = "ac-list";
    list.hidden = true;
    wrap.appendChild(input);
    wrap.appendChild(list);
    host.appendChild(wrap);

    const actions = document.createElement("div");
    actions.className = "map-actions";
    actions.innerHTML = `<button class="btn ghost" data-skip>Skip</button><button class="btn" data-submit>Submit</button>`;
    host.appendChild(actions);

    let items: string[] = [], active = -1;
    const render = () => {
      items = Logic.suggest(input.value, candidates, 6);
      if (!items.length) {
        list.hidden = true;
        list.innerHTML = "";
        active = -1;
        return;
      }
      list.innerHTML = items
        .map(
          (c, i) =>
            `<div class="ac-opt${i === active ? " active" : ""}" data-i="${i}">${c}</div>`
        )
        .join("");
      list.hidden = false;
    };
    const submit = (val: string) => {
      list.hidden = true;
      onSubmit(val);
    };

    input.addEventListener("input", () => {
      active = -1;
      render();
    });
    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (items.length) { active = (active + 1) % items.length; render(); }
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (items.length) { active = (active - 1 + items.length) % items.length; render(); }
      } else if (e.key === "Enter") {
        e.preventDefault();
        // Highlighted item wins; otherwise take the top suggestion (typeahead),
        // falling back to the raw text only when there are no suggestions.
        submit(active >= 0 && items[active] ? items[active] : items[0] ?? input.value);
      }
    });
    list.addEventListener("click", (e: MouseEvent) => {
      const o = (e.target as HTMLElement).closest<HTMLElement>(".ac-opt");
      if (o) submit(items[+(o.dataset.i ?? 0)]);
    });
    (actions.querySelector("[data-submit]") as HTMLElement).onclick = () =>
      submit(input.value);
    (actions.querySelector("[data-skip]") as HTMLElement).onclick = () =>
      submit("");
    setTimeout(() => input.focus(), 60);
  },

  setTimer(text: string | null) {
    if (!this._timerEl) return;
    (this._timerEl as HTMLElement & { hidden: boolean }).hidden = text == null;
    if (text != null) this._timerEl.textContent = text;
  },

  destroy() {
    this._cancelDrag();

    // Remove pointer listeners.
    if (this._onPointerMove)   window.removeEventListener("pointermove",   this._onPointerMove);
    if (this._onPointerUp)     window.removeEventListener("pointerup",     this._onPointerUp);
    if (this._onPointerCancel) window.removeEventListener("pointercancel", this._onPointerCancel);
    if (this._onMouseUp)       window.removeEventListener("mouseup",       this._onMouseUp);

    this._onPointerMove = null;
    this._onPointerUp = null;
    this._onPointerCancel = null;
    this._onMouseUp = null;

    // Empty SVG and bank.
    if (this._svgEl) this._svgEl.innerHTML = "";
    if (this._bankEl) this._bankEl.innerHTML = "";
    if (this._nameEl) { this._nameEl.hidden = true; }
    if (this._nameHostEl) this._nameHostEl.innerHTML = "";

    this.svg = null;
    this.g = null;
    this.gSil = null;
    this.gPlaced = null;
    this.gLabels = null;
    this.gDrag = null;
    this.path = null;
    this.projection = null;
    this.zoom = null;
    this.transform = zoomIdentity;
    this.model = null;
    this.drag = null;
    this.fieldBounds = null;
    this._override = new Map<string, Feature>();
    this._colourMap = new Map<string, string>();
    this._naming = false;
    this._inited = false;

    this._svgEl = null;
    this._wrapEl = null;
    this._bankEl = null;
    this._timerEl = null;
    this._subEl = null;
    this._nameEl = null;
    this._nameHostEl = null;
  },
};
