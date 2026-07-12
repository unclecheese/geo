import { useEffect, useRef } from "react";
import { TVEventControl, useTVEventHandler, type HWEvent } from "react-native";
import {
  cursorReduce,
  clickReduce,
  nudgeCursor,
  CURSOR_GAIN,
  DPAD_CURSOR_STEP,
  DOUBLE_CLICK_MS,
  type CursorState,
  type ClickState,
} from "./cursor-logic";

const VIEWPORT = { w: 1920, h: 1080 };
const DPAD_DIRS = new Set(["up", "down", "left", "right"]);
const CURSOR_START = { x: VIEWPORT.w / 2, y: VIEWPORT.h / 2 };

export interface RemoteInputHandlers {
  /** CURSOR mode — an unanswered find question. Enables the touch-surface pan
   *  gesture, and makes Select a cursor click (single = pick, double = zoom)
   *  and the clickable dpad a fine cursor nudge. */
  cursorEnabled: boolean;
  /** REVEAL up (answered, find or name): a plain Select advances to the next
   *  question. Dpad is ignored (the Next button is non-focusable). */
  advanceEnabled: boolean;
  /** Every cursor move — pan sample OR dpad nudge — reports the new position so
   *  the screen can move the crosshair and re-resolve the hovered country. */
  onCursor(c: { x: number; y: number }): void;
  onSingleClick(c: { x: number; y: number }): void;
  onDoubleClick(c: { x: number; y: number }): void;
  onAdvance(): void;
  /** Play/Pause = hint, always live (find and name alike). */
  onPlayPause(): void;
}

/**
 * Wires the Siri Remote's pan gesture + select/dpad/playPause events (via the
 * react-native-tvos fork's TVEventControl/useTVEventHandler) to the floating
 * cursor. Two input channels move the ONE cursor: the touch surface pans it
 * coarsely (cursorReduce, gain) and the clickable dpad nudges it finely
 * (nudgeCursor, a fixed step ~1/5 of a pan flick). Select discriminates single
 * (pick) vs double (zoom) via clickReduce.
 *
 * Gating: pan/click/nudge are live only in CURSOR mode (unanswered find); when
 * the reveal card is up (advanceEnabled) a plain Select advances instead; in
 * name mode (neither flag) Select/dpad pass through untouched so the native
 * focus engine can drive the choices grid / typed input. playPause always maps
 * to the hint.
 */
export function useRemoteInput(handlers: RemoteInputHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const cursorRef = useRef<CursorState>({ ...CURSOR_START, lastSample: null });
  const clickRef = useRef<ClickState>({ pendingSince: null });
  const singleClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Enable the touch-surface pan gesture only while the cursor is live, so it
  // doesn't fire (or fight the focus engine) during name mode or the reveal.
  useEffect(() => {
    if (handlers.cursorEnabled) {
      TVEventControl.enableTVPanGesture();
    } else {
      TVEventControl.disableTVPanGesture();
    }
  }, [handlers.cursorEnabled]);

  useEffect(() => {
    return () => {
      TVEventControl.disableTVPanGesture();
      if (singleClickTimer.current) clearTimeout(singleClickTimer.current);
    };
  }, []);

  useTVEventHandler((event: HWEvent) => {
    const h = handlersRef.current;

    if (event.eventType === "playPause") {
      h.onPlayPause();
      return;
    }

    if (event.eventType === "pan") {
      if (!h.cursorEnabled || !event.body) return;
      cursorRef.current = cursorReduce(cursorRef.current, event.body, CURSOR_GAIN, VIEWPORT);
      h.onCursor({ x: cursorRef.current.x, y: cursorRef.current.y });
      return;
    }

    if (event.eventType === "select") {
      if (h.cursorEnabled) {
        const cursor = { x: cursorRef.current.x, y: cursorRef.current.y };
        const result = clickReduce(clickRef.current, Date.now());
        clickRef.current = result.state;
        if (result.fire === "double") {
          if (singleClickTimer.current) {
            clearTimeout(singleClickTimer.current);
            singleClickTimer.current = null;
          }
          h.onDoubleClick(cursor);
        } else {
          const pendingSince = result.state.pendingSince;
          singleClickTimer.current = setTimeout(() => {
            singleClickTimer.current = null;
            if (clickRef.current.pendingSince === pendingSince) {
              clickRef.current = { pendingSince: null };
              h.onSingleClick(cursor);
            }
          }, DOUBLE_CLICK_MS);
        }
      } else if (h.advanceEnabled) {
        h.onAdvance();
      }
      // name mode (neither flag): let the focus engine handle Select.
      return;
    }

    if (DPAD_DIRS.has(event.eventType)) {
      if (!h.cursorEnabled) return; // reveal / name: not a cursor nudge
      const dir = event.eventType as "up" | "down" | "left" | "right";
      const moved = nudgeCursor(cursorRef.current, dir, DPAD_CURSOR_STEP, VIEWPORT);
      cursorRef.current = { ...cursorRef.current, x: moved.x, y: moved.y };
      h.onCursor(moved);
    }
  });
}
