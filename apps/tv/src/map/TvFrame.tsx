import { useMemo } from "react";
import {
  Canvas,
  Fill,
  Group,
  Path,
  Circle,
  Text,
  matchFont,
  type SkFont,
  type SkPath,
} from "@shopify/react-native-skia";
import { geoBounds, geoMercator, geoPath } from "d3-geo";
import type { Feature } from "geojson";
import { Logic, DataLayer, type Country } from "@geobean/core";
import { theme } from "../theme";
import { SkiaPathContext } from "./SkiaPathContext";

interface TvFrameProps {
  target: Country;
  shown: Country[]; // numbered neighbours; shown[i] -> badge i+1
  width?: number;
  height?: number;
}

// System-font Skia typefaces (Task 18 swaps in the bundled serif). matchFont is
// synchronous — it resolves against the platform font manager, so unlike useFont
// there's no null-loading state to guard.
const LABEL_FONT: SkFont = matchFont({ fontFamily: "Georgia", fontSize: 26, fontWeight: "700" });
const BADGE_FONT: SkFont = matchFont({ fontFamily: "Helvetica", fontSize: 22, fontWeight: "700" });

const BADGE_R = 20;

/**
 * Static Skia render of the framed neighbourhood — the 10-foot port of web's
 * <FrameView> (apps/web/components/FrameView.tsx). Same framing math: a Mercator
 * projection fit to the target's geoBounds expanded 60% (built as a MultiPoint
 * frame so d3's polygon-winding whole-sphere bug can't bite), then every country
 * is drawn and clipped to the canvas. The target is brass-tinted, the numbered
 * neighbours parchment, everything else muted land. Numbered badges sit at each
 * shown neighbour's projected centroid; the target carries a name label.
 *
 * Everything projects fresh per question (target changes) but that's cheap — one
 * geoPath pass over ~250 features, no zoom/pan (this picture is fixed).
 */
export function TvFrame({ target, shown, width = 1120, height = 620 }: TvFrameProps) {
  const { paths, badges, label } = useMemo(() => {
    const empty = {
      paths: [] as { id: string; path: SkPath; cls: string }[],
      badges: [] as { num: number; x: number; y: number }[],
      label: null as null | { name: string; x: number; y: number },
    };
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
    const pad = 12;
    const proj = geoMercator().fitExtent([[pad, pad], [width - pad, height - pad]], frame);

    const shownIds = new Map(shown.map((c, i) => [c.id, i + 1]));
    const paths = DataLayer.countries
      .filter((c) => c.feature)
      .map((c) => {
        const ctx = new SkiaPathContext();
        geoPath(proj, ctx as never)(c.feature as never);
        const cls = c.id === target.id ? "target" : shownIds.has(c.id) ? "neighbour" : "land";
        return { id: c.id, path: ctx.path, cls };
      })
      .filter((p) => !p.path.isEmpty());

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const badges = shown
      .map((c, i) => {
        const pt = c.centroid ? proj(c.centroid) : null;
        if (!pt) return null;
        return {
          num: i + 1,
          x: clamp(pt[0], pad + BADGE_R, width - pad - BADGE_R),
          y: clamp(pt[1], pad + BADGE_R, height - pad - BADGE_R),
        };
      })
      .filter(Boolean) as { num: number; x: number; y: number }[];

    const tp = target.centroid ? proj(target.centroid) : null;
    const label = tp
      ? { name: target.name, x: clamp(tp[0], pad, width - pad), y: clamp(tp[1], pad, height - pad) }
      : null;

    return { paths, badges, label };
  }, [target, shown, width, height]);

  const fillFor = (cls: string) =>
    cls === "target" ? theme.target : cls === "neighbour" ? theme.parchment : theme.land;

  return (
    <Canvas style={{ width, height, borderRadius: 12 }}>
      <Fill color={theme.sea} />
      {/* Fill pass. */}
      {paths.map((p) => (
        <Path key={p.id} path={p.path} color={fillFor(p.cls)} />
      ))}
      {/* Border hairlines. */}
      {paths.map((p) => (
        <Path
          key={`s-${p.id}`}
          path={p.path}
          style="stroke"
          color={theme.landStroke}
          strokeWidth={1}
        />
      ))}
      {/* Target name label, centred on its centroid. */}
      {label && (
        <Text
          font={LABEL_FONT}
          text={label.name}
          x={label.x - LABEL_FONT.measureText(label.name).width / 2}
          y={label.y + 8}
          color={theme.ink}
        />
      )}
      {/* Numbered neighbour badges. */}
      {badges.map((b) => {
        const t = String(b.num);
        const m = BADGE_FONT.measureText(t);
        return (
          <Group key={b.num}>
            <Circle cx={b.x} cy={b.y} r={BADGE_R} color={theme.oxblood} />
            <Circle cx={b.x} cy={b.y} r={BADGE_R} style="stroke" color={theme.cream} strokeWidth={2} />
            <Text
              font={BADGE_FONT}
              text={t}
              x={b.x - m.width / 2}
              y={b.y + 8}
              color={theme.cream}
            />
          </Group>
        );
      })}
    </Canvas>
  );
}
