import { useEffect, useRef } from "react";
import { TVEventControl, useTVEventHandler, type HWEvent } from "react-native";
import { cursorReduce, clickReduce, CURSOR_GAIN, DOUBLE_CLICK_MS, type CursorState, type ClickState } from "./cursor-logic";

const VIEWPORT = { w: 1920, h: 1080 };
const DPAD_DIRS = new Set(["up", "down", "left", "right"]);

export interface RemoteInputHandlers {
  enabled: boolean;
  onCursor(c: { x: number; y: number }): void;
  onSingleClick(c: { x: number; y: number }): void;
  onDoubleClick(c: { x: number; y: number }): void;
  onDpad(dir: "up" | "down" | "left" | "right"): void;
  onPlayPause(): void;
}

/**
 * Wires the Siri Remote's pan gesture + select/dpad/playPause events (via the
 * react-native-tvos fork's TVEventControl/useTVEventHandler) to the pure
 * cursor-logic reducers. Pan and select are only meaningful while `enabled`
 * (cursor mode); dpad/playPause pass through regardless so callers can decide
 * per-screen whether cursor mode is active.
 */
export function useRemoteInput(handlers: RemoteInputHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const cursorRef = useRef<CursorState>({ x: VIEWPORT.w / 2, y: VIEWPORT.h / 2, lastSample: null });
  const clickRef = useRef<ClickState>({ pendingSince: null });
  const singleClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (handlers.enabled) {
      TVEventControl.enableTVPanGesture();
    } else {
      TVEventControl.disableTVPanGesture();
    }
  }, [handlers.enabled]);

  useEffect(() => {
    return () => {
      TVEventControl.disableTVPanGesture();
      if (singleClickTimer.current) clearTimeout(singleClickTimer.current);
    };
  }, []);

  useTVEventHandler((event: HWEvent) => {
    const h = handlersRef.current;

    if (event.eventType === "pan") {
      if (!h.enabled || !event.body) return;
      cursorRef.current = cursorReduce(cursorRef.current, event.body, CURSOR_GAIN, VIEWPORT);
      h.onCursor({ x: cursorRef.current.x, y: cursorRef.current.y });
      return;
    }

    if (event.eventType === "select") {
      if (!h.enabled) return;
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
      return;
    }

    if (DPAD_DIRS.has(event.eventType)) {
      if (!h.enabled) return;
      h.onDpad(event.eventType as "up" | "down" | "left" | "right");
      return;
    }

    if (event.eventType === "playPause") {
      h.onPlayPause();
    }
  });
}
