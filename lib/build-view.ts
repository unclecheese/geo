// Browser-only D3 continent builder singleton. React owns the DOM element refs;
// D3 owns everything inside them. Import only from client components / client-only code.
import {
  select,
  geoEqualEarth,
  geoMercator,
  geoPath,
  geoArea,
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
import { useAtlasStore } from "@/store/atlas-store";
import type { Country } from "@/lib/types";
import type { Feature, FeatureCollection } from "geojson";

type SVGSel = Selection<SVGSVGElement, unknown, null, undefined>;
type GSel = Selection<SVGGElement, unknown, null, undefined>;

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
  borderGap: 0,
  centroidRadius: 0,
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
    this._render();
    this.renderBank();
  },

  _render() {
    if (!this.model || !this.svg) return;
    const topo = DataLayer.topo as never; // Topo type is internal to data-layer
    if (!topo) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geoms = (topo as any).objects.countries.geometries as Array<{ id: string | number }>;
    const placeableCcn3 = new Set(
      this.model.graph.placeable.map((c) => c.ccn3).filter(Boolean)
    );
    const memberGeoms = geoms.filter((g) =>
      placeableCcn3.has(DataLayer.pad3(g.id))
    );
    const merged = topoMerge(topo, memberGeoms as never);

    // Frame on main landmasses only (displayFeature) so Hawaii/Aleutians
    // don't shrink the whole continent.
    const displayFeatures = this.model.graph.placeable
      .filter((c) => c.feature)
      .map((c) => this._displayFeature(c));
    const displayColl: FeatureCollection = {
      type: "FeatureCollection",
      features: displayFeatures,
    };

    this.projection = geoEqualEarth().fitExtent(
      [
        [30, 30],
        [Math.max(160, this.width - 268), this.height - 30],
      ],
      displayColl
    );
    this.path = geoPath(this.projection);

    const b = this.path.bounds(displayColl);
    this.fieldBounds = b as [[number, number], [number, number]];
    this.extent = Math.hypot(b[1][0] - b[0][0], b[1][1] - b[0][1]);
    this.centroidRadius = 0.05 * this.extent;
    this.borderGap = 0.02 * this.extent;

    this.gSil!.selectAll("path")
      .data([merged])
      .join("path")
      .attr("class", "build-silhouette")
      .attr("d", this.path as never);

    this._redrawPlaced();
  },

  // Main landmass only — drops polygons smaller than ~18% of the largest.
  // Cached per country on country._display.
  _displayFeature(country: Country): Feature {
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

  // Stable, vivid HSL colour per country (hashed from its id).
  _colour(country: Country): string {
    const id = String(country.id);
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const hue = h % 360;
    const sat = 55 + (h >> 9) % 22;
    const lig = 52 + (h >> 13) % 13;
    return `hsl(${hue} ${sat}% ${lig}%)`;
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
    const showNames = useAtlasStore.getState().settings.showNames !== false;
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
    const showNames = useAtlasStore.getState().settings.showNames !== false;
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

  _endDrag(ev: PointerEvent) {
    if (!this.drag) return;
    const { country, tile, trueCentroid, el } = this.drag;
    this.drag = null;
    tile.classList.remove("dragging");

    const [x, y] = this._localPoint(ev);
    const disp = this._displayFeature(country);
    const dx = x - trueCentroid[0], dy = y - trueCentroid[1];

    const placedNeighbours = country.neighbours.filter(
      (n) => this.model!.placedIds.has(n.id) && n.feature
    );
    const result = Placement.validate({
      dropCentroid: [x, y],
      trueCentroid,
      pieceRings: this._projectRings(disp, dx, dy),
      neighbourRings: placedNeighbours.map((n) =>
        this._projectRings(this._displayFeature(n))
      ),
      borderGap: this.borderGap,
      centroidRadius: this.centroidRadius,
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

  // Name-for-credit prompt (unnamed mode). Builds inline autocomplete,
  // calls onSubmit(typed) once (Enter / pick / Skip).
  showNamePrompt(onSubmit: (typed: string) => void) {
    if (!this._nameEl || !this._nameHostEl || !this.model) return;
    this._nameHostEl.innerHTML = "";
    this._nameEl.hidden = false;
    this._naming = true;
    const names = [...new Set(this.model.graph.placeable.map((c) => c.name))];
    this._buildAutocomplete(this._nameHostEl, names, (v) => onSubmit(v));
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
        submit(active >= 0 && items[active] ? items[active] : input.value);
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
