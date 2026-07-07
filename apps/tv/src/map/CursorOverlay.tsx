import { forwardRef, useImperativeHandle, useState } from "react";
import { Canvas, Group, Circle } from "@shopify/react-native-skia";
import { StyleSheet } from "react-native";
import { theme } from "../theme";

export interface CursorOverlayHandle {
  /** Move the crosshair. Repaints only this overlay, never the map Canvas. */
  set(pt: { x: number; y: number } | null): void;
}

/**
 * The find-quiz crosshair, on its own absolutely-positioned Canvas stacked over
 * TvMap. Kept separate on purpose: every Siri-Remote pan sample moves the
 * cursor, and if the crosshair lived inside TvMap the whole ~470-node country
 * path tree would reconcile on every sample (the delay-then-jump the hardware
 * pass hit). This component owns its own state and is driven imperatively via
 * its ref, so a pan sample re-renders ONLY this three-node Canvas — the parent
 * screen and the memoised map Canvas never re-render on cursor motion.
 * Screen-space coords (no group transform), so the crosshair is a fixed
 * on-screen size at any map zoom.
 */
export const CursorOverlay = forwardRef<CursorOverlayHandle>(function CursorOverlay(_props, ref) {
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  useImperativeHandle(ref, () => ({ set: setCursor }), []);

  if (!cursor) return null;
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Group>
        <Circle cx={cursor.x} cy={cursor.y} r={10} style="stroke" color={theme.brass} strokeWidth={2} />
      </Group>
    </Canvas>
  );
});
