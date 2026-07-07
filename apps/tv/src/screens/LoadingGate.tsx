import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { DataLayer } from "@geobean/core";
import { registerTvPlatform } from "../platform-tv";
import { theme } from "../theme";
import { fonts } from "../fonts";

// Module-level guard so a remount reuses the in-flight load rather than
// racing a second fetch — mirrors web's DataProvider.
let loadPromise: Promise<{ fromCache: boolean }> | null = null;

/**
 * Gates the app behind data load, mirroring web's DataProvider. On mount it
 * registers the tvOS platform (storage + rehydrate) then kicks DataLayer.load,
 * showing a parchment-on-navy status line until `DataLayer.countries` is
 * populated. On fetch failure it shows the error with a focusable Retry.
 */
export function LoadingGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(DataLayer.countries.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading map & country data…");
  const startedRef = useRef(false);

  useEffect(() => {
    if (ready) return;
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    registerTvPlatform();
    if (!loadPromise) loadPromise = DataLayer.load((m) => setStatus(m));
    loadPromise
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((e: unknown) => {
        loadPromise = null; // allow a retry
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  if (error) {
    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.h2}>Couldn&apos;t load the world</Text>
          <Text style={styles.status}>{error}</Text>
          <Pressable
            onPress={() => {
              loadPromise = null;
              startedRef.current = false;
              setError(null);
            }}
            hasTVPreferredFocus
            style={({ focused }) => [styles.retry, focused && styles.retryFocused]}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.h2}>Loading the world…</Text>
          <Text style={styles.status}>{status}</Text>
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" },
  card: { alignItems: "center", paddingHorizontal: 48 },
  h2: {
    color: theme.cream,
    fontSize: 40,
    fontFamily: fonts.displaySemi,
    marginBottom: 16,
    textAlign: "center",
  },
  status: { color: theme.creamDim, fontSize: 22, fontFamily: fonts.body, textAlign: "center" },
  retry: {
    marginTop: 32,
    backgroundColor: theme.parchment,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 36,
  },
  retryFocused: { borderColor: theme.brass, transform: [{ scale: 1.08 }] },
  retryText: { color: theme.ink, fontSize: 24, fontWeight: "600" },
});
