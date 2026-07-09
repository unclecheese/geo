import { useRef } from "react";
import { useTVEventHandler, type HWEvent } from "react-native";

const DPAD_DIRS = new Set(["up", "down", "left", "right"]);

export interface RemoteInputHandlers {
  /** dpad + select fire only while enabled (an unanswered find question); when
   *  off, the native focus engine owns them (reveal buttons, name-mode grid). */
  enabled: boolean;
  onDpad(dir: "up" | "down" | "left" | "right"): void;
  onSelect(): void;
  /** Play/Pause = hint, always live (find and name alike). */
  onPlayPause(): void;
}

/**
 * Wires the Siri Remote's dpad/select/playPause hardware events (via the
 * react-native-tvos fork's useTVEventHandler) to the find-quiz navigation.
 * There is no cursor or pan gesture: find is driven purely by directional dpad
 * moves (region picker, then country nav) with select to confirm. dpad/select
 * are gated by `enabled` so they don't fight the native focus engine when a
 * reveal card or the name-mode choices grid is up; playPause passes through
 * regardless so the (invisible) hint affordance works in every state.
 */
export function useRemoteInput(handlers: RemoteInputHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useTVEventHandler((event: HWEvent) => {
    const h = handlersRef.current;

    if (event.eventType === "playPause") {
      h.onPlayPause();
      return;
    }

    if (!h.enabled) return;

    if (event.eventType === "select") {
      h.onSelect();
    } else if (DPAD_DIRS.has(event.eventType)) {
      h.onDpad(event.eventType as "up" | "down" | "left" | "right");
    }
  });
}
