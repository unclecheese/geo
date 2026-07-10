import { useEffect, useRef } from "react";
import { TVEventControl, useTVEventHandler, type HWEvent } from "react-native";
import { useIsFocused } from "@react-navigation/native";

/**
 * Make the Siri Remote's Menu/Back button pop the current screen instead of
 * quitting the app. `enableTVMenuKey()` intercepts the Menu button and routes it
 * through `useTVEventHandler` as a `menu` event, which we turn into the caller's
 * `goBack`.
 *
 * Focus-gated on purpose. The app runs on a NATIVE stack (react-native-screens),
 * which keeps screens BENEATH the top one mounted — so every screen that used
 * this hook (Menu, Config, Map, …) had a live `menu` listener at once. A single
 * Menu press then fired all of them: e.g. on the Map screen it would run Map's
 * handler AND the still-mounted Config screen's `goBack()`, popping Map entirely
 * instead of letting Map handle it (this is what jumped find country-nav straight
 * to the menu). Gating enable + handler on `useIsFocused()` means only the
 * visible top screen owns the Menu button; blurred screens underneath stay inert.
 *
 * `goBack` is read through a ref so the handler always calls the latest callback
 * without re-subscribing.
 */
export function useMenuButtonBack(goBack: () => void): void {
  const isFocused = useIsFocused();

  const goBackRef = useRef(goBack);
  goBackRef.current = goBack;
  const focusedRef = useRef(isFocused);
  focusedRef.current = isFocused;

  useEffect(() => {
    if (!isFocused) return;
    TVEventControl.enableTVMenuKey();
    return () => TVEventControl.disableTVMenuKey();
  }, [isFocused]);

  useTVEventHandler((event: HWEvent) => {
    if (event.eventType === "menu" && focusedRef.current) goBackRef.current();
  });
}
