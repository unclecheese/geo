"use client";

import { useEffect, useRef } from "react";
import { MapView } from "@/lib/map-view";
import { useQuizStore } from "@/store/quiz-store";
import { useAtlasStore } from "@/store/atlas-store";

// The D3 world map: React owns the <svg>/<div> refs; D3 owns everything inside.
// StrictMode safe — destroy() is idempotent and init() calls destroy() first if
// already initialised (handles the StrictMode double-mount).
export function MapViewComponent() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const wrapEl = wrapRef.current;
    const svgEl = svgRef.current;
    if (!wrapEl || !svgEl) return;

    MapView.init(svgEl, wrapEl);
    MapView.render();
    MapView.onSelect = (c) => useQuizStore.getState().handleMapSelect(c);

    const settings = useAtlasStore.getState().settings;
    if (settings.heatmap) MapView.refreshColors();

    return () => {
      MapView.destroy();
    };
  }, []);

  return (
    <div id="map-wrap" ref={wrapRef}>
      <svg id="map" ref={svgRef} />
    </div>
  );
}
