import { useAtlasStore } from "@/store/atlas-store";

/**
 * True once zustand has rehydrated persisted state from localStorage. Settings-
 * derived UI should gate on this to avoid an SSR/first-paint hydration mismatch
 * (the server renders defaults; the client may have stored different settings).
 */
export function useHydrated(): boolean {
  return useAtlasStore((s) => s._hasHydrated);
}
