import { useMemo } from "react";
import { View } from "react-native";
import { DataLayer, computeTinyIds, layoutTinyBoxes } from "@geobean/core";
import { TvMap, PROJ } from "../map/TvMap";

/**
 * Temporary verification screen (Task 9): renders the full world map at k=1
 * with tiny-island boxes and no cursor. Later tasks replace the Map quiz body
 * with the real find/name flow; this proves the Skia renderer end to end.
 */
export function MapProbeScreen() {
  const boxes = useMemo(() => {
    const tinyIds = computeTinyIds(DataLayer.countries);
    return layoutTinyBoxes(DataLayer.countries, tinyIds, PROJ);
  }, []);
  return (
    <View style={{ flex: 1 }}>
      <TvMap transform={{ k: 1, tx: 0, ty: 0 }} paints={new Map()} boxes={boxes} />
    </View>
  );
}
