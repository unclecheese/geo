// Browser-only D3 map singleton. React owns the <svg> ref; D3 owns everything
// inside it. Import this only from client components / client-only code.
import {
  select,
  geoEqualEarth,
  geoPath,
  geoGraticule10,
  zoom,
  zoomIdentity,
  zoomTransform,
  pointer,
} from "d3";
import type { Selection, ZoomBehavior } from "d3";
import { DataLayer } from "@/lib/data-layer";
import { Logic } from "@/lib/logic";
import { MODES } from "@/lib/modes";
import { BOX_COLORS } from "@/lib/constants";
import { useAtlasStore } from "@/store/atlas-store";
import type { Country } from "@/lib/types";
import type { Feature, Polygon } from "geojson";

// The projected area (px²) and bounding box of a feature's largest polygon —
// its biggest single landmass on screen. Used both to decide whether a country
// is a tiny island and to frame the outline box on that landmass (not the whole
// scattered multipolygon, whose centre can be open ocean).
function largestPolygon(
  path: ReturnType<typeof geoPath>,
  feature: Feature
): { area: number; bounds: [[number, number], [number, number]] } | null {
  const g = feature.geometry;
  const rings =
    g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  let best: Polygon | null = null;
  let bestArea = -1;
  for (const coordinates of rings) {
    const poly: Polygon = { type: "Polygon", coordinates };
    const a = path.area(poly as never);
    if (a > bestArea) {
      bestArea = a;
      best = poly;
    }
  }
  return best ? { area: bestArea, bounds: path.bounds(best as never) as [[number, number], [number, number]] } : null;
}

type SVGSelection = Selection<SVGSVGElement, unknown, null, undefined>;
type GSelection = Selection<SVGGElement, unknown, null, undefined>;

export const MapView = {
  svg: null as SVGSelection | null,
  g: null as GSelection | null,
  gCountries: null as GSelection | null,
  gMarkers: null as GSelection | null,
  gLabels: null as GSelection | null,
  gArrow: null as GSelection | null,
  _arrowPt: null as [number, number] | null,
  path: null as ReturnType<typeof geoPath> | null,
  projection: null as ReturnType<typeof geoEqualEarth> | null,
  zoom: null as ZoomBehavior<SVGSVGElement, unknown> | null,
  width: 0,
  height: 0,
  onSelect: null as ((country: Country) => void) | null,
  _regionColor: null as null,
  _inited: false,
  tinyIds: new Set<string>(),
  // Click-resolution sites: each locatable country's projected centroid (in the
  // unzoomed g coordinate space). A missed click resolves to the nearest of
  // these within HIT_CUTOFF on-screen px, giving every country a water buffer.
  _sites: [] as { x: number; y: number; country: Country }[],
  // Padded outline boxes framing tiny countries, in unzoomed g coordinates. Drawn
  // inside the zoom group (so they scale with the map and reveal the country's
  // geography when zoomed in) and sized so no two overlap. They are the primary
  // click target for islands and microstates.
  _boxes: [] as { x0: number; y0: number; x1: number; y1: number; country: Country }[],
  _downPt: null as [number, number] | null,
  _pendingSelect: null as ReturnType<typeof setTimeout> | null,
  _mouseupHandler: null as (() => void) | null,

  REGION_BASE: {
    Africa: "#3b4a7a",
    Americas: "#3a5a78",
    Asia: "#5a4a7e",
    Europe: "#4a6e6e",
    Oceania: "#6e5a4a",
    Antarctic: "#3a4258",
    Other: "#33395c",
  } as Record<string, string>,

  // SELECT_DELAY: debounces single-click so a dblclick zoom never registers as answer.
  SELECT_DELAY: 240,

  // HIT_CUTOFF: max on-screen distance (px) from a click to a country's centroid
  // for the click to count as selecting it. Constant in screen space, so zooming
  // in shrinks the geographic catch area and lets you separate close neighbours.
  HIT_CUTOFF: 44,

  // Island outline boxes, sized in unzoomed g units (scaled by the map's linear
  // size at render). BOX_PAD is added around the island's own bounding box;
  // BOX_MAX_HALF caps an isolated box; BOX_MIN_HALF floors it so an island that
  // hugs a mainland (Singapore) still gets a clickable box. Boxes are shrunk
  // where needed so none overlap each other (Logic.boxHalfSizesNoOverlap) or
  // spill onto a neighbouring country's coastline.
  BOX_PAD: 8,
  BOX_MAX_HALF: 16,
  BOX_MIN_HALF: 4,

  init(svgEl: SVGSVGElement, wrapEl: HTMLElement) {
    if (this._inited) this.destroy();

    this.svg = select(svgEl);
    this.width = wrapEl.clientWidth;
    this.height = wrapEl.clientHeight;
    this.svg.attr("viewBox", [0, 0, this.width, this.height].join(" "));

    // ocean background
    this.svg
      .append("rect")
      .attr("class", "ocean")
      .attr("width", this.width)
      .attr("height", this.height)
      .attr("fill", "var(--map-sea)");

    // Fit the sphere into the canvas with a bottom inset so the quiz HUD (fixed
    // bottom overlay) never overlaps the southern continents.
    this.projection = geoEqualEarth().fitExtent(
      [
        [12, 12],
        [this.width - 12, this.height - 96],
      ],
      { type: "Sphere" }
    );
    this.path = geoPath(this.projection);

    this.g = this.svg.append("g").attr("class", "world");

    // graticule + sphere outline for depth
    const graticule = geoGraticule10();
    this.g
      .append("path")
      .datum({ type: "Sphere" } as unknown as GeoJSON.GeoJsonObject)
      .attr("d", this.path as never)
      .attr("fill", "none")
      .attr("stroke", "rgba(110,231,255,.08)")
      .attr("stroke-width", 1.2);
    this.g
      .append("path")
      .datum(graticule)
      .attr("d", this.path as never)
      .attr("fill", "none")
      .attr("stroke", "rgba(255,255,255,.04)")
      .attr("stroke-width", 0.5);

    this.gCountries = this.g.append("g").attr("class", "countries");
    this.gMarkers = this.g.append("g").attr("class", "markers");
    this.gLabels = this.g.append("g").attr("class", "labels");
    this.gArrow = this.g.append("g").attr("class", "arrows");

    // zoom behaviour
    this.zoom = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 200]) // deep zoom so Borders can frame even small countries large
      .translateExtent([
        [0, 0],
        [this.width, this.height],
      ])
      .on("zoom", (ev) => {
        this.g!.attr("transform", ev.transform);
        // Country borders stay a constant on-screen width. The tiny-country boxes
        // scale with the map (revealing geography as you zoom in) but keep a crisp
        // outline via CSS vector-effect, so they need no per-zoom adjustment here.
        this.gCountries!.selectAll("path").attr("stroke-width", 0.3 / ev.transform.k);
        // keep the target arrow a constant on-screen size
        if (this._arrowPt) {
          this.gArrow!
            .select<SVGGElement>("g.map-arrow")
            .attr("transform", `translate(${this._arrowPt[0]},${this._arrowPt[1]}) scale(${1 / ev.transform.k})`);
        }
      });

    this.svg.call(this.zoom).on("dblclick.zoom", null); // we handle dblclick ourselves

    this.svg.on("dblclick", (ev: MouseEvent) => {
      // Cancel any pending single-click select so dblclick is always a zoom.
      this._cancelPendingSelect();
      const [mx, my] = pointer(ev);
      this.zoomToPoint(mx, my, 4);
    });

    this.svg.on("mousedown", (ev: MouseEvent) => {
      this.svg!.node()!.classList.add("dragging");
      this._downPt = pointer(ev, this.svg!.node());
    });

    // Selection for clicks that miss every country polygon (the polygons
    // stopPropagation their own clicks, so this only fires on "ocean"): resolve
    // to the tiny-country box under the point, else the nearest country within
    // HIT_CUTOFF. Skipped after a drag, which was a pan — not a pick.
    this.svg.on("click", (ev: MouseEvent) => {
      if (this._isDrag(ev)) return;
      const [mx, my] = pointer(ev, this.svg!.node());
      const c = this._countryAt(mx, my);
      if (c) this._scheduleSelect(c);
    });

    // Store bound handler reference so we can remove it on destroy.
    this._mouseupHandler = () => this.svg?.node()?.classList.remove("dragging");
    window.addEventListener("mouseup", this._mouseupHandler);

    this._inited = true;
  },

  render() {
    if (!this.gCountries || !this.gMarkers || !this.gLabels || !this.path || !this.projection) return;
    const feats = DataLayer.features;
    this.tinyIds = new Set<string>();
    const self = this;

    this.gCountries
      .selectAll<SVGPathElement, Feature>("path.country")
      .data(feats, (d) => String(d.id))
      .join("path")
      .attr("class", "country")
      .attr("d", this.path as never)
      .attr("fill", (d) => this._fillFor(d))
      .on("click", function (ev: MouseEvent, d: Feature) {
        ev.stopPropagation();
        const c = DataLayer.byCcn3.get(DataLayer.pad3(d.id as string | number));
        if (c) self._scheduleSelect(c);
      });

    // Build a click-resolution site (projected largest-polygon centroid) for
    // every locatable country, and collect the tiny ISLANDS — small countries
    // with no land border. Landlocked/coastal microstates (Vatican, Qatar, the
    // Gambia) are excluded: they're clickable on their own land or their bigger
    // neighbour, and don't want a box floating in someone else's territory.
    const proj = this.projection;
    // Sphere area normalises the tiny test so it's viewport-independent, and its
    // square root scales the box padding/caps with the map's linear size so boxes
    // stay proportionally the same on a phone and a wide monitor.
    const sphereArea = this.path.area({ type: "Sphere" } as never) || 1;
    const boxScale = Math.sqrt(sphereArea / 859371); // 859371 = sphere px² at the 1440×810 reference
    const boxPad = this.BOX_PAD * boxScale;
    const boxMaxHalf = this.BOX_MAX_HALF * boxScale;
    const boxMinHalf = this.BOX_MIN_HALF * boxScale;
    this._sites = [];
    const islands: { c: Country; cx: number; cy: number; desired: number }[] = [];
    for (const c of DataLayer.countries) {
      if (!c.centroid) continue;
      const p = proj(c.centroid);
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
      this._sites.push({ x: p[0], y: p[1], country: c });
      // Tiny = largest landmass is a minute fraction of the globe (or no polygon
      // at all, e.g. Tuvalu). tinyIds drives close-framing in name mode and stays
      // inclusive of microstates; only tiny ISLANDS (no land border) get a box.
      const lp = c.feature ? largestPolygon(this.path, c.feature) : null;
      if (lp && !Logic.isTiny(lp.area / sphereArea)) continue;
      this.tinyIds.add(c.id);
      if ((c._borders?.length ?? 0) !== 0) continue;
      // Frame and centre the box on the largest island (not the whole scattered
      // multipolygon), so the box sits on real land and reveals it when zoomed.
      let cx = p[0],
        cy = p[1],
        extent = 0;
      if (lp) {
        const [[x0, y0], [x1, y1]] = lp.bounds;
        cx = (x0 + x1) / 2;
        cy = (y0 + y1) / 2;
        extent = Math.max(x1 - x0, y1 - y0) / 2;
      }
      islands.push({ c, cx, cy, desired: Math.min(extent + boxPad, boxMaxHalf) });
    }

    // Two clamps, each only ever shrinking a box: (1) so no two island boxes
    // overlap, and (2) so a box doesn't spill onto a neighbouring country's
    // coastline (Chebyshev distance, since the box is a square). An island that
    // hugs a mainland keeps a floor so it stays clickable, at the cost of a small
    // unavoidable overlap.
    const centers = islands.map((t) => ({ x: t.cx, y: t.cy }));
    const halves = Logic.boxHalfSizesNoOverlap(centers, islands.map((t) => t.desired));
    const coast = this._coastVertices(proj);
    this._boxes = islands.map((t, i) => {
      let half = halves[i];
      let nearest = Infinity;
      for (const v of coast) {
        if (v.id === t.c.id) continue;
        const cheb = Math.max(Math.abs(v.x - t.cx), Math.abs(v.y - t.cy));
        if (cheb < nearest) nearest = cheb;
      }
      half = Math.min(half, Math.max(nearest, boxMinHalf));
      return { x0: t.cx - half, y0: t.cy - half, x1: t.cx + half, y1: t.cy + half, country: t.c };
    });

    this.gMarkers
      .selectAll<SVGRectElement, (typeof this._boxes)[number]>("rect.mk-box")
      .data(this._boxes, (d) => d.country.id)
      .join("rect")
      .attr("class", "mk-box")
      .attr("x", (d) => d.x0)
      .attr("y", (d) => d.y0)
      .attr("width", (d) => d.x1 - d.x0)
      .attr("height", (d) => d.y1 - d.y0)
      .attr("rx", 1.5)
      .on("click", function (ev: MouseEvent, d) {
        ev.stopPropagation();
        if (self._isDrag(ev)) return;
        self._scheduleSelect(d.country);
      });

    // Country names intentionally never rendered — keep labels layer empty.
    this.gLabels.selectAll("text.label").remove();
    this.gLabels.attr("opacity", 0);
  },

  // Projected exterior-ring vertices of every country with geometry, tagged with
  // the owning country id. Used to clamp island boxes off foreign coastlines.
  // Subsampled (every 2nd vertex) — coastlines are dense at 50m, so this stays
  // accurate while keeping the one-off cost low.
  _coastVertices(proj: ReturnType<typeof geoEqualEarth>): { x: number; y: number; id: string }[] {
    const pts: { x: number; y: number; id: string }[] = [];
    for (const c of DataLayer.countries) {
      if (!c.feature) continue;
      const g = c.feature.geometry;
      const polys =
        g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      for (const poly of polys) {
        const ring = poly[0]; // exterior ring
        for (let i = 0; i < ring.length; i += 2) {
          const p = proj(ring[i] as [number, number]);
          if (p && isFinite(p[0]) && isFinite(p[1])) pts.push({ x: p[0], y: p[1], id: c.id });
        }
      }
    }
    return pts;
  },

  _fillFor(feature: Feature): string {
    const c = DataLayer.byCcn3.get(DataLayer.pad3(feature.id as string | number));
    const settings = useAtlasStore.getState().settings;
    const leitner = useAtlasStore.getState().leitner;
    if (settings.heatmap && c) {
      const m = Logic.masteryFor(leitner, c.id, Object.keys(MODES) as never);
      if (m == null) return "#222a4d";
      const box = Math.min(4, Math.round(m * 4));
      return BOX_COLORS[box];
    }
    if (!c) return "#1d2440"; // non-sovereign / territory
    return this.REGION_BASE[c.region] || this.REGION_BASE.Other;
  },

  refreshColors() {
    if (!this.gCountries) return;
    this.gCountries
      .selectAll<SVGPathElement, Feature>("path.country")
      .transition()
      .duration(400)
      .attr("fill", (d) => this._fillFor(d));
  },

  // Drop a bouncing arrow that points down at a country — used to make the
  // highlighted target findable when it's a tiny country (even zoomed in).
  markArrow(country: Country) {
    if (!this.gArrow || !this.projection || !this.svg) return;
    // Point at the largest-polygon centroid (same anchor as the marker dot), so
    // the arrow lands on real land for archipelagos rather than mid-ocean.
    const p = country.centroid ? (this.projection(country.centroid) as [number, number]) : null;
    if (!p || !isFinite(p[0]) || !isFinite(p[1])) return;
    this._arrowPt = p;
    const k = zoomTransform(this.svg.node()!).k;
    this.gArrow.selectAll("*").remove();
    const g = this.gArrow
      .append("g")
      .attr("class", "map-arrow")
      .attr("transform", `translate(${p[0]},${p[1]}) scale(${1 / k})`);
    // Arrow tip at (0,0), pointing straight down at the country.
    g.append("g")
      .attr("class", "arrow-bob")
      .append("path")
      .attr("d", "M0,0 L-7,-13 L-2.6,-13 L-2.6,-27 L2.6,-27 L2.6,-13 L7,-13 Z");
  },

  clearArrow() {
    this._arrowPt = null;
    if (this.gArrow) this.gArrow.selectAll("*").remove();
  },

  clearHighlights() {
    this.clearArrow();
    if (!this.gCountries || !this.gMarkers) return;
    this.gCountries
      .selectAll<SVGPathElement, Feature>("path.country")
      .classed("hl-good", false)
      .classed("hl-bad", false)
      .classed("hl-target", false)
      .attr("stroke", "var(--map-sea)")
      .attr("stroke-opacity", 1);
    this.gCountries
      .selectAll<SVGPathElement, Feature>("path.country")
      .attr("fill", (d) => this._fillFor(d));
    // Reset tiny-country boxes to their neutral outline (drop any inline colour).
    this.gMarkers
      .selectAll<SVGRectElement, { country: Country }>("rect.mk-box")
      .attr("stroke", null)
      .attr("fill", null)
      .classed("hl", false);
  },

  paint(id: string, kind: "good" | "bad" | "target" | "sel") {
    if (!this.gCountries || !this.gMarkers) return;
    const colors = { good: "#34d399", bad: "#f87171", target: "#fbbf24", sel: "#38bdf8" };
    this.gCountries
      .selectAll<SVGPathElement, Feature>("path.country")
      .filter((d) => DataLayer.pad3(d.id as string | number) === DataLayer.pad3(id))
      .attr("fill", colors[kind])
      .attr("stroke", "#fff")
      .attr("stroke-opacity", 0.9);
    // For a tiny country the polygon is sub-pixel, so the visible feedback is the
    // outline box: colour its stroke and give it a faint matching wash.
    this.gMarkers
      .selectAll<SVGRectElement, { country: Country }>("rect.mk-box")
      .filter((d) => d.country.id === id)
      .attr("stroke", colors[kind])
      .attr("fill", colors[kind] + "33")
      .classed("hl", true);
  },

  flashSelect(id: string) {
    if (!this.gCountries || !this.svg) return;
    const k = zoomTransform(this.svg.node()!).k;
    this.gCountries
      .selectAll<SVGPathElement, Feature>("path.country")
      .filter((d) => DataLayer.pad3(d.id as string | number) === DataLayer.pad3(id))
      .interrupt()
      .attr("stroke", "var(--accent)")
      .attr("stroke-width", 2)
      .transition()
      .duration(500)
      .attr("stroke-width", 0.3 / k);
    // Tiny countries have no visible polygon to flash, so pulse their box.
    if (this.gMarkers) {
      this.gMarkers
        .selectAll<SVGRectElement, { country: Country }>("rect.mk-box")
        .filter((d) => d.country.id === id)
        .interrupt()
        .attr("stroke", "var(--cream)")
        .transition()
        .duration(600)
        .attr("stroke", null);
    }
  },

  zoomToPoint(mx: number, my: number, k = 4) {
    if (!this.svg || !this.zoom) return;
    const t = zoomIdentity
      .translate(this.width / 2, this.height / 2)
      .scale(k)
      .translate(-mx, -my);
    this.svg.transition().duration(750).call(this.zoom.transform, t);
  },

  reset() {
    this.clearArrow();
    if (!this.svg || !this.zoom) return;
    this.svg.transition().duration(750).call(this.zoom.transform, zoomIdentity);
  },

  frameCountry(country: Country, pad = 0.4) {
    if (!this.svg || !this.zoom || !this.path || !this.projection) return;
    const feat = country.feature;
    let bounds: [[number, number], [number, number]];
    if (feat) {
      bounds = this.path.bounds(feat) as [[number, number], [number, number]];
    } else if (country.centroid) {
      const p = this.projection(country.centroid)!;
      bounds = [
        [p[0] - 30, p[1] - 30],
        [p[0] + 30, p[1] + 30],
      ];
    } else {
      return;
    }
    const [[x0, y0], [x1, y1]] = bounds;
    const dx = x1 - x0,
      dy = y1 - y0;
    const cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2;
    let k = Math.min(14, (1 - pad) / Math.max(dx / this.width, dy / this.height));
    if (!isFinite(k) || k < 1) k = Math.min(6, this.tinyIds.has(country.id) ? 6 : 3);
    k = Math.max(1.4, Math.min(k, this.tinyIds.has(country.id) ? 7 : 8));
    const t = zoomIdentity
      .translate(this.width / 2, this.height / 2)
      .scale(k)
      .translate(-cx, -cy);
    this.svg.transition().duration(800).call(this.zoom.transform, t);
  },


  // Country for an on-screen click. First the tiny-country outline boxes: the
  // click is mapped back into g-space and tested for containment (boxes don't
  // overlap, so at most one matches). Otherwise the nearest country centroid
  // within HIT_CUTOFF on-screen px — a water buffer for everything else.
  _countryAt(mx: number, my: number): Country | null {
    if (!this.svg) return null;
    const t = zoomTransform(this.svg.node()!);
    const [wx, wy] = t.invert([mx, my]);
    for (const b of this._boxes) {
      if (wx >= b.x0 && wx <= b.x1 && wy >= b.y0 && wy <= b.y1) return b.country;
    }
    if (!this._sites.length) return null;
    const screen = this._sites.map((s) => ({ x: t.applyX(s.x), y: t.applyY(s.y) }));
    const i = Logic.nearestWithin(screen, mx, my, this.HIT_CUTOFF);
    return i >= 0 ? this._sites[i].country : null;
  },

  // True if the pointer has moved far enough since mousedown that this was a
  // drag/pan rather than a click, so selection should be skipped.
  _isDrag(ev: MouseEvent): boolean {
    if (!this._downPt || !this.svg) return false;
    const [mx, my] = pointer(ev, this.svg.node()!);
    return Math.hypot(mx - this._downPt[0], my - this._downPt[1]) > 6;
  },

  _scheduleSelect(country: Country) {
    this._cancelPendingSelect();
    this._pendingSelect = setTimeout(() => {
      this._pendingSelect = null;
      if (this.onSelect) this.onSelect(country);
    }, this.SELECT_DELAY);
  },

  _cancelPendingSelect() {
    if (this._pendingSelect) {
      clearTimeout(this._pendingSelect);
      this._pendingSelect = null;
    }
  },

  destroy() {
    this._cancelPendingSelect();
    if (this._mouseupHandler) {
      window.removeEventListener("mouseup", this._mouseupHandler);
      this._mouseupHandler = null;
    }
    if (this.svg) {
      this.svg.selectAll("*").remove();
    }
    this.g = null;
    this.gCountries = null;
    this.gMarkers = null;
    this.gLabels = null;
    this.gArrow = null;
    this._arrowPt = null;
    this.path = null;
    this.projection = null;
    this.zoom = null;
    this.onSelect = null;
    this.tinyIds = new Set();
    this._sites = [];
    this._boxes = [];
    this._downPt = null;
    this._inited = false;
  },
};
