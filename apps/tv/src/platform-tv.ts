// async-storage is pinned to 2.2.0 in package.json ON PURPOSE. 3.x dropped tvOS
// from its podspec (no `:tvos` platform, iOS-only xcframework), so the native
// module resolves to null at runtime on tvOS and ALL persistence silently fails
// ("Native module is null"). This breaks nothing tsc/vitest can see. Do not bump
// past 2.x without confirming tvOS support is restored in the release.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setKVStorage, setFxPort, useAtlasStore } from "@geobean/core";
import { fxTv } from "./fx-tv";

let registered = false;

/**
 * Wire the tvOS platform seams into core: an AsyncStorage-backed KVStorage, then
 * an explicit persist rehydrate (the store ships with `skipHydration: true` so it
 * waits for storage to exist before reading), then the tvOS FxPort (silent audio
 * cues + a real Skia confetti burst — see fx-tv.ts for the sound go/no-go).
 * Idempotent — safe to call from every screen mount.
 */
export function registerTvPlatform(): void {
  if (registered) return;
  registered = true;
  setKVStorage({
    get: (k) => AsyncStorage.getItem(k),
    set: (k, v) => AsyncStorage.setItem(k, v),
    remove: (k) => AsyncStorage.removeItem(k),
  });
  setFxPort(fxTv);
  void useAtlasStore.persist.rehydrate();
}
