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

// Projected area (px²) of a feature's largest polygon — the biggest single
// landmass on screen. Used to decide whether a country needs a marker dot.
function largestPolyPxArea(path: ReturnType<typeof geoPath>, feature: Feature): number {
  const g = feature.geometry;
  const rings =
    g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  let max = 0;
  for (const coordinates of rings) {
    const a = path.area({ type: "Polygon", coordinates } as Polygon as never);
    if (a > max) max = a;
  }
  return max;
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
        // keep markers readable at any zoom (country names never shown)
        this.gMarkers!.selectAll("circle.marker").attr("r", 2.4 / Math.sqrt(ev.transform.k));
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

    // Water-buffer selection: a click that misses every country polygon (the
    // polygons stopPropagation their own clicks, so this only fires on "ocean")
    // resolves to the nearest country within HIT_CUTOFF. Skipped after a drag,
    // which was a pan — not a pick.
    this.svg.on("click", (ev: MouseEvent) => {
      const [mx, my] = pointer(ev, this.svg!.node());
      if (this._downPt && Math.hypot(mx - this._downPt[0], my - this._downPt[1]) > 6) return;
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
    // every locatable country, and a visible marker dot for those whose biggest
    // landmass is too small to see. Clicking is handled by nearest-site lookup
    // (see _countryAt), so the dots need no hit target of their own — which also
    // ends the old bug where fixed-radius hit discs overlapped and stole clicks.
    const proj = this.projection;
    this._sites = [];
    const markerData: Country[] = [];
    for (const c of DataLayer.countries) {
      if (!c.centroid) continue;
      const p = proj(c.centroid);
      if (!p || !isFinite(p[0]) || !isFinite(p[1])) continue;
      this._sites.push({ x: p[0], y: p[1], country: c });
      if (!c.feature || Logic.isTiny(largestPolyPxArea(this.path, c.feature))) {
        this.tinyIds.add(c.id);
        markerData.push(c);
      }
    }

    this.gMarkers
      .selectAll<SVGGElement, Country>("g.mk")
      .data(markerData, (d) => d.id)
      .join((enter) => {
        const grp = enter
          .append("g")
          .attr("class", "mk")
          .attr("transform", (d) => {
            const p = d.centroid ? proj(d.centroid) : null;
            return p ? `translate(${p[0]},${p[1]})` : "translate(-99,-99)";
          });
        grp.append("circle").attr("class", "marker").attr("r", 2.4);
        return grp;
      });

    // Country names intentionally never rendered — keep labels layer empty.
    this.gLabels.selectAll("text.label").remove();
    this.gLabels.attr("opacity", 0);
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
    this.gMarkers.selectAll("g.mk circle.marker").attr("fill", "var(--accent-2)");
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
    this.gMarkers
      .selectAll<SVGGElement, Country>("g.mk")
      .filter((d) => d.id === id)
      .select("circle.marker")
      .attr("fill", colors[kind]);
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

  // Borders mode: zoom so the target's bounding box spans a CONSTANT fraction of
  // the viewport, regardless of the country's real size — a "picture frame" where
  // the subject dominates (France and Cambodia end up the same apparent size).
  // Clamped only by the map's zoom limits, so even tiny countries fill the frame.
  frameConstant(country: Country, frac = 0.62) {
    if (!this.svg || !this.zoom || !this.path || !this.projection) return;
    let bounds: [[number, number], [number, number]];
    if (country.feature) {
      bounds = this.path.bounds(country.feature) as [[number, number], [number, number]];
    } else if (country.centroid) {
      const p = this.projection(country.centroid)!;
      bounds = [
        [p[0] - 18, p[1] - 18],
        [p[0] + 18, p[1] + 18],
      ];
    } else {
      return;
    }
    const [[x0, y0], [x1, y1]] = bounds;
    const dx = Math.max(1, x1 - x0),
      dy = Math.max(1, y1 - y0);
    const cx = (x0 + x1) / 2,
      cy = (y0 + y1) / 2;
    let k = frac / Math.max(dx / this.width, dy / this.height);
    k = Math.max(1, Math.min(200, k));
    const t = zoomIdentity
      .translate(this.width / 2, this.height / 2)
      .scale(k)
      .translate(-cx, -cy);
    this.svg.transition().duration(800).call(this.zoom.transform, t);
  },

  // Repaint the whole borders board in one idempotent pass: reset everything to
  // base, then colour the home country (amber), found neighbours (green), and the
  // currently-selected sliver (blue).
  paintBorders(opts: { homeId: string; foundIds: string[]; activeId?: string | null }) {
    this.clearHighlights();
    this.paint(opts.homeId, "target");
    for (const id of opts.foundIds) this.paint(id, "good");
    if (opts.activeId) this.paint(opts.activeId, "sel");
  },

  // Nearest country to an on-screen point within HIT_CUTOFF px, or null. Sites
  // are stored in unzoomed g-space, so apply the current zoom transform before
  // measuring — that keeps the catch radius constant on screen at any zoom.
  _countryAt(mx: number, my: number): Country | null {
    if (!this.svg || !this._sites.length) return null;
    const t = zoomTransform(this.svg.node()!);
    const screen = this._sites.map((s) => ({ x: t.applyX(s.x), y: t.applyY(s.y) }));
    const i = Logic.nearestWithin(screen, mx, my, this.HIT_CUTOFF);
    return i >= 0 ? this._sites[i].country : null;
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
    this._downPt = null;
    this._inited = false;
  },
};
