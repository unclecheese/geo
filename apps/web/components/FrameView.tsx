"use client";

import { useMemo } from "react";
import { geoBounds, geoMercator, geoPath } from "d3";
import type { Feature } from "geojson";
import { Logic, type Country } from "@geobean/core";
import { DataLayer } from "@/lib/data-layer";

interface FrameViewProps {
  target: Country;
  shown: Country[]; // numbered neighbours; shown[i] -> badge i+1
  width?: number;
  height?: number;
}

// A static, non-interactive picture of one country framed with padding so its
// neighbours are partially visible. Numbered badges mark the neighbours the quiz
// asks about; the target is filled and labelled. Water is just the SVG background.
// Rendered fresh per question — cheap enough to draw every country and clip.
export function FrameView({ target, shown, width = 640, height = 440 }: FrameViewProps) {
  const { paths, badges, label } = useMemo(() => {
    const empty = { paths: [] as { id: string; d: string; cls: string }[], badges: [] as { num: number; x: number; y: number }[], label: null as null | { name: string; x: number; y: number } };
    if (!target.feature) return empty;

    const raw = geoBounds(target.feature as Feature) as [[number, number], [number, number]];
    const [[w, s], [e, n]] = Logic.expandBounds(raw, 0.6);
    const frame: Feature = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPoint",
        coordinates: [
          [w, s],
          [e, s],
          [e, n],
          [w, n],
        ],
      },
    };
    const pad = 8;
    const proj = geoMercator().fitExtent([[pad, pad], [width - pad, height - pad]], frame);
    const path = geoPath(proj);

    const shownIds = new Map(shown.map((c, i) => [c.id, i + 1]));
    const paths = DataLayer.countries
      .filter((c) => c.feature)
      .map((c) => {
        const d = path(c.feature as Feature) || "";
        const cls = c.id === target.id ? "fv-target" : shownIds.has(c.id) ? "fv-neighbour" : "fv-land";
        return { id: c.id, d, cls };
      })
      .filter((p) => p.d);

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const badges = shown
      .map((c, i) => {
        const pt = c.centroid ? proj(c.centroid) : null;
        if (!pt) return null;
        return { num: i + 1, x: clamp(pt[0], pad + 14, width - pad - 14), y: clamp(pt[1], pad + 14, height - pad - 14) };
      })
      .filter(Boolean) as { num: number; x: number; y: number }[];

    const tp = target.centroid ? proj(target.centroid) : null;
    const label = tp ? { name: target.name, x: clamp(tp[0], pad, width - pad), y: clamp(tp[1], pad, height - pad) } : null;

    return { paths, badges, label };
  }, [target, shown, width, height]);

  return (
    <svg className="frame-view" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`The area around ${target.name}`}>
      <defs>
        <clipPath id="fv-clip">
          <rect x="0" y="0" width={width} height={height} rx="10" />
        </clipPath>
      </defs>
      <g clipPath="url(#fv-clip)">
        <rect className="fv-water" x="0" y="0" width={width} height={height} />
        {paths.map((p) => (
          <path key={p.id} className={p.cls} d={p.d} />
        ))}
        {label && (
          <text className="fv-label" x={label.x} y={label.y} textAnchor="middle">
            {label.name}
          </text>
        )}
        {badges.map((b) => (
          <g key={b.num} className="fv-badge" transform={`translate(${b.x},${b.y})`}>
            <circle r="13" />
            <text textAnchor="middle" dy="4.5">
              {b.num}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
