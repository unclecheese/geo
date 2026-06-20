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
import type { Feature } from "geojson";

type SVGSelection = Selection<SVGSVGElement, unknown, null, undefined>;
type GSelection = Selection<SVGGElement, unknown, null, undefined>;

export const MapView = {
  svg: null as SVGSelection | null,
  g: null as GSelection | null,
  gCountries: null as GSelection | null,
  gMarkers: null as GSelection | null,
  gLabels: null as GSelection | null,
  path: null as ReturnType<typeof geoPath> | null,
  projection: null as ReturnType<typeof geoEqualEarth> | null,
  zoom: null as ZoomBehavior<SVGSVGElement, unknown> | null,
  width: 0,
  height: 0,
  onSelect: null as ((country: Country) => void) | null,
  _regionColor: null as null,
  _inited: false,
  tinyIds: new Set<string>(),
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

    // zoom behaviour
    this.zoom = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 14])
      .translateExtent([
        [0, 0],
        [this.width, this.height],
      ])
      .on("zoom", (ev) => {
        this.g!.attr("transform", ev.transform);
        // keep markers readable at any zoom (country names never shown)
        this.gMarkers!.selectAll("circle.marker").attr("r", 2.4 / Math.sqrt(ev.transform.k));
        this.gCountries!.selectAll("path").attr("stroke-width", 0.3 / ev.transform.k);
      });

    this.svg.call(this.zoom).on("dblclick.zoom", null); // we handle dblclick ourselves

    this.svg.on("dblclick", (ev: MouseEvent) => {
      // Cancel any pending single-click select so dblclick is always a zoom.
      this._cancelPendingSelect();
      const [mx, my] = pointer(ev);
      this.zoomToPoint(mx, my, 4);
    });

    this.svg.on("mousedown", () => this.svg!.node()!.classList.add("dragging"));

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

    // markers for tiny sovereign countries and microstates without polygon geometry
    const markerData: Country[] = [];
    for (const c of DataLayer.countries) {
      if (!c.feature) {
        if (c.centroid) markerData.push(c);
        continue;
      }
      const b = this.path.bounds(c.feature);
      const area = Math.max(0, b[1][0] - b[0][0]) * Math.max(0, b[1][1] - b[0][1]);
      if (Logic.isTiny(area)) {
        this.tinyIds.add(c.id);
        markerData.push(c);
      }
    }

    const proj = this.projection;
    this.gMarkers
      .selectAll<SVGGElement, Country>("g.mk")
      .data(markerData, (d) => d.id)
      .join((enter) => {
        const grp = enter.append("g").attr("class", "mk").attr("transform", (d) => {
          const p = d.centroid ? proj(d.centroid) : null;
          return p ? `translate(${p[0]},${p[1]})` : "translate(-99,-99)";
        });
        grp.append("circle").attr("class", "marker").attr("r", 2.4);
        grp
          .append("circle")
          .attr("class", "marker-hit")
          .attr("r", 9)
          .on("click", (ev: MouseEvent, d: Country) => {
            ev.stopPropagation();
            self._scheduleSelect(d);
          });
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

  clearHighlights() {
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

  paint(id: string, kind: "good" | "bad" | "target") {
    if (!this.gCountries || !this.gMarkers) return;
    const colors = { good: "#34d399", bad: "#f87171", target: "#fbbf24" };
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
    this.path = null;
    this.projection = null;
    this.zoom = null;
    this.onSelect = null;
    this.tinyIds = new Set();
    this._inited = false;
  },
};
