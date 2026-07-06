// Pure reducers for Siri Remote pan-to-cursor and select-click discrimination.
// No React, no react-native — jest-testable without a device or simulator.

export type CursorState = { x: number; y: number; lastSample: { x: number; y: number } | null };
export type PanSample = { state: "Began" | "Changed" | "Ended"; x: number; y: number };
export type ClickState = { pendingSince: number | null };

/** Tunable single source for Task 18's on-device calibration pass. */
export const CURSOR_GAIN = 1.6;
export const DOUBLE_CLICK_MS = 250;

function clamp(v: number, max: number): number {
  return Math.min(Math.max(v, 0), max);
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
