"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { DataLayer } from "@geobean/core";
import { registerWebPlatform } from "@/lib/platform-web";

interface DataContextValue {
  ready: boolean;
  error: string | null;
}

const DataContext = createContext<DataContextValue>({ ready: false, error: null });

export function useData(): DataContextValue {
  return useContext(DataContext);
}

// Module-level guard so StrictMode's double-mount (and any remount) loads once.
let loadPromise: Promise<{ fromCache: boolean }> | null = null;

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(DataLayer.countries.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading map & country data…");
  const startedRef = useRef(false);

  useEffect(() => {
    if (ready) return;
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    registerWebPlatform();
    import("@/lib/ports-web").then((m) => m.registerWebPorts());
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
      <div id="loader">
        <div className="load-card">
          <h2>Couldn&apos;t load the world</h2>
          <p>{error}</p>
          <button
            className="btn"
            style={{ marginTop: 18, width: "auto", padding: "11px 22px" }}
            onClick={() => {
              loadPromise = null;
              startedRef.current = false;
              setError(null);
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div id="loader">
        <div className="load-card">
          <div className="spinner" />
          <h2>Loading the world…</h2>
          <p>{status}</p>
        </div>
      </div>
    );
  }

  return <DataContext.Provider value={{ ready, error }}>{children}</DataContext.Provider>;
}
