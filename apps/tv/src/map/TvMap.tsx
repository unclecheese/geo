import { memo, useMemo } from "react";
import { Canvas, Fill, Group, Path, Rect } from "@shopify/react-native-skia";
import { geoEqualEarth } from "d3-geo";
import { DataLayer, type TinyBox, type MapTransform } from "@geobean/core";
import { theme } from "../theme";
import { buildCountryPaths } from "./SkiaPathContext";

/** tvOS renders at 1080p points; same equal-area projection family as the web
 *  map-view. Shared so hit-resolution (Task 11+) projects identically. */
export const PROJ = geoEqualEarth().fitExtent(
  [
    [0, 0],
    [1920, 1080],
  ],
  { type: "Sphere" }
);

export type PaintKind = "good" | "bad" | "target" | "sel" | "hover";

const PAINT_COLOR: Record<PaintKind, string> = {
  good: theme.good,
  bad: theme.bad,
  target: theme.target,
  sel: theme.brass,
  hover: theme.brass, // cursor-over fill, matching the web map's brass hover
};

export interface TvMapProps {
  transform: MapTransform;
  paints: Map<string, PaintKind>;
  boxes: TinyBox[];
}

/**
 * Full-screen Skia world map. Country paths are projected once (PROJ is fixed);
 * zoom/pan is a cheap transform on the group rather than a re-projection. The
 * border stroke uses `strokeWidth = 1 / k` so hairlines stay ~1px on screen at
 * any zoom — the same constant-width trick the web SVG uses.
 *
 * `memo`'d so this ~470-node path tree re-renders only when transform/paints/
 * boxes actually change (paint, frame, zoom) — hence the controller installs a
 * fresh `paints` Map on every highlight change rather than mutating in place.
 */
function TvMapImpl({ transform, paints, boxes }: TvMapProps) {
  const { k, tx, ty } = transform;
  const paths = useMemo(() => buildCountryPaths(PROJ, DataLayer.featureById), []);
  const ids = useMemo(() => Array.from(paths.keys()), [paths]);
  const groupTransform = useMemo(
    () => [{ translateX: tx }, { translateY: ty }, { scale: k }],
    [tx, ty, k]
  );

  return (
    <Canvas style={{ flex: 1, backgroundColor: theme.sea }}>
      <Fill color={theme.sea} />
      <Group transform={groupTransform}>
        {/* Fill pass: one path per country, paint override or base land. */}
        {ids.map((id) => {
          const p = paths.get(id)!;
          const paint = paints.get(id);
          return (
            <Path key={id} path={p} color={paint ? PAINT_COLOR[paint] : theme.land} />
          );
        })}
        {/* Border pass: hairline stroke, constant on-screen width. */}
        {ids.map((id) => (
          <Path
            key={`s-${id}`}
            path={paths.get(id)!}
            style="stroke"
            color={theme.landStroke}
            strokeWidth={1 / k}
          />
        ))}
        {/* Tiny-island outline boxes (projected, unzoomed coords). */}
        {boxes.map((b) => (
          <Rect
            key={`b-${b.id}`}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            style="stroke"
            color={theme.hair}
            strokeWidth={1 / k}
          />
        ))}
      </Group>
    </Canvas>
  );
}

export const TvMap = memo(TvMapImpl);
