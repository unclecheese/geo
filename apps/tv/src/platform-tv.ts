import AsyncStorage from "@react-native-async-storage/async-storage";
import { setKVStorage, useAtlasStore } from "@geobean/core";

let registered = false;

/**
 * Wire the tvOS platform seams into core: an AsyncStorage-backed KVStorage, then
 * an explicit persist rehydrate (the store ships with `skipHydration: true` so it
 * waits for storage to exist before reading). fx stays the default no-op until
 * Task 18. Idempotent — safe to call from every screen mount.
 */
export function registerTvPlatform(): void {
  if (registered) return;
  registered = true;
  setKVStorage({
    get: (k) => AsyncStorage.getItem(k),
    set: (k, v) => AsyncStorage.setItem(k, v),
    remove: (k) => AsyncStorage.removeItem(k),
  });
  void useAtlasStore.persist.rehydrate();
}
