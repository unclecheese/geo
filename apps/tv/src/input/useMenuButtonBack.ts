import { useEffect } from "react";
import { TVEventControl, useTVEventHandler, type HWEvent } from "react-native";

/**
 * Make the Siri Remote's Menu/Back button pop the current screen instead of
 * quitting the app. By default the tvOS fork lets the Menu button propagate to
 * the OS (exit to the tvOS home screen); `enableTVMenuKey()` intercepts it and
 * routes it through `useTVEventHandler` as a `menu` event, which we turn into a
 * `goBack()`. Disabled on unmount so the root Menu screen keeps the standard
 * tvOS behaviour (Menu there exits the app). Popping unmounts the screen, which
 * runs its cleanup effect (the session `quit()`), so the round ends cleanly.
 */
export function useMenuButtonBack(goBack: () => void): void {
  useEffect(() => {
    TVEventControl.enableTVMenuKey();
    return () => TVEventControl.disableTVMenuKey();
  }, []);

  useTVEventHandler((event: HWEvent) => {
    if (event.eventType === "menu") goBack();
  });
}
