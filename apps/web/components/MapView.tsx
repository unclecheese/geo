"use client";

import { useEffect, useRef } from "react";
import { MapView } from "@/lib/map-view";
import { useAtlasStore } from "@/store/atlas-store";
import type { Country } from "@/lib/types";

interface MapViewComponentProps {
  // Click handler for a country/marker. Each screen wires its own (map quiz vs
  // borders). Kept in a separate effect so swapping it never re-inits the map.
  onSelect?: (country: Country) => void;
}

// The D3 world map: React owns the <svg>/<div> refs; D3 owns everything inside.
// StrictMode safe — destroy() is idempotent and init() calls destroy() first if
// already initialised (handles the StrictMode double-mount).
export function MapViewComponent({ onSelect }: MapViewComponentProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const wrapEl = wrapRef.current;
    const svgEl = svgRef.current;
    if (!wrapEl || !svgEl) return;

    MapView.init(svgEl, wrapEl);
    MapView.render();

    const settings = useAtlasStore.getState().settings;
    if (settings.heatmap) MapView.refreshColors();

    return () => {
      MapView.destroy();
    };
  }, []);

  // Wire the click handler separately so changing it doesn't tear down the map.
  useEffect(() => {
    MapView.onSelect = onSelect ?? null;
    return () => {
      MapView.onSelect = null;
    };
  }, [onSelect]);

  return (
    <div id="map-wrap" ref={wrapRef}>
      <svg id="map" ref={svgRef} />
    </div>
  );
}
