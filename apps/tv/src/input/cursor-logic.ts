// Pure reducers for Siri Remote pan-to-cursor and select-click discrimination.
// No React, no react-native — jest-testable without a device or simulator.

export type CursorState = { x: number; y: number; lastSample: { x: number; y: number } | null };
export type PanSample = { state: "Began" | "Changed" | "Ended"; x: number; y: number };
export type ClickState = { pendingSince: number | null };

/**
 * Pan-delta → cursor-px multiplier. The fork's pan body is a cumulative
 * translation in ~screen points, so 1.0 is a mouse-like 1:1 mapping; 1.6
 * over-amplified each sample into a visible jump. This is the on-device
 * tunable — nudge it up for a faster cursor, down for finer control.
 */
export const CURSOR_GAIN = 1.0;
export const DOUBLE_CLICK_MS = 250;

// One clickable-dpad press nudges the cursor this many px — the GRANULAR mover.
// The touch surface's pan (cursorReduce) is the COARSE mover: a swipe crosses
// the pad in one gesture, moving the cursor several of these steps at once
// (~5×), so the two channels are "fine placement" vs "get there fast". Both are
// on-device tunables; nudge this down for finer control, up for faster steps.
export const DPAD_CURSOR_STEP = 40;

function clamp(v: number, max: number): number {
  return Math.min(Math.max(v, 0), max);
}

/**
 * D-pad click → fine, fixed-step cursor move (screen coords, y grows down: up
 * decreases y). Pure and clamped to bounds like cursorReduce, so the two movers
 * share one coordinate space and the same edge behaviour.
 */
export function nudgeCursor(
  c: { x: number; y: number },
  dir: "up" | "down" | "left" | "right",
  step: number,
  bounds: { w: number; h: number },
): { x: number; y: number } {
  const dx = dir === "left" ? -step : dir === "right" ? step : 0;
  const dy = dir === "up" ? -step : dir === "down" ? step : 0;
  return { x: clamp(c.x + dx, bounds.w), y: clamp(c.y + dy, bounds.h) };
}

/**
 * Pan samples from the fork are cumulative translation from gesture start,
 * so "Changed" must diff against the previous sample, not the origin.
 */
export function cursorReduce(
  c: CursorState,
  ev: PanSample,
  gain: number,
  bounds: { w: number; h: number },
): CursorState {
  switch (ev.state) {
    case "Began":
      return { ...c, lastSample: { x: ev.x, y: ev.y } };
    case "Changed": {
      const last = c.lastSample ?? { x: ev.x, y: ev.y };
      const dx = (ev.x - last.x) * gain;
      const dy = (ev.y - last.y) * gain;
      return {
        x: clamp(c.x + dx, bounds.w),
        y: clamp(c.y + dy, bounds.h),
        lastSample: { x: ev.x, y: ev.y },
      };
    }
    case "Ended":
      return { ...c, lastSample: null };
  }
}

/**
 * A lone select arms `pendingSince`; the caller starts a DOUBLE_CLICK_MS
 * timeout that fires "single" if still pending. A second select within the
 * window fires "double" and clears the pend.
 */
export function clickReduce(
  state: ClickState,
  nowMs: number,
): { state: ClickState; fire: "single" | "double" | null } {
  if (state.pendingSince !== null && nowMs - state.pendingSince <= DOUBLE_CLICK_MS) {
    return { state: { pendingSince: null }, fire: "double" };
  }
  return { state: { pendingSince: nowMs }, fire: null };
}
