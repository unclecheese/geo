import { setKVStorage, useAtlasStore } from "@geobean/core";

/** localStorage → KVStorage. Sync under the hood; promises for the shared interface. */
export function registerWebPlatform(): void {
  const ok = typeof window !== "undefined" && !!window.localStorage;
  setKVStorage({
    async get(k) { return ok ? localStorage.getItem(k) : null; },
    async set(k, v) { if (ok) localStorage.setItem(k, v); },
    async remove(k) { if (ok) localStorage.removeItem(k); },
  });
  void useAtlasStore.persist.rehydrate();
}
