"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePinchGuard } from "@/lib/use-pinch-guard";
import { BuildGraph } from "@/lib/build-graph";
import { Audio2 } from "@/lib/fx";
import { useAtlasStore } from "@/store/atlas-store";
import { useBuildStore } from "@/store/build-store";
import { useData } from "@/components/DataProvider";
import { BuildViewComponent } from "@/components/BuildView";
import { BuildResults } from "@/components/BuildResults";
import { FxCanvas } from "@/components/FxCanvas";
import { Toast } from "@/components/Toast";

export default function BuildPage() {
  const router = useRouter();
  const { ready } = useData();
  usePinchGuard();

  const active = useBuildStore((s) => s.active);
  const done   = useBuildStore((s) => s.done);
  const start  = useBuildStore((s) => s.start);
  const quit   = useBuildStore((s) => s.quit);

  const settings    = useAtlasStore((s) => s.settings);
  const setSettings = useAtlasStore((s) => s.setSettings);

  // On mount: redirect if region isn't a supported continent; else start build.
  // StrictMode guard: only start() if not already active and not completed.
  useEffect(() => {
    if (!ready) return;
    const continent = useAtlasStore.getState().settings.regions[0];
    if (!continent || !(BuildGraph.SUPPORTED as readonly string[]).includes(continent)) {
      router.replace("/");
      return;
    }
    const st = useBuildStore.getState();
    if (!st.active && !st.done) start();
    return () => {
      useBuildStore.getState().quit();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Keyboard: Esc → reset zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        import("@/lib/build-view").then(({ BuildView }) => {
          if (BuildView._inited) BuildView.resetZoom();
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const backToMenu = () => {
    quit();
    router.push("/", { scroll: false });
  };

  const toggleSound = () => {
    const on = !settings.sound;
    setSettings({ sound: on });
    if (on) { Audio2.ensure(); Audio2.correct(); }
  };

  const handleAgain = () => {
    // Reset done, then restart.
    useBuildStore.setState({ done: null });
    start();
  };

  if (!ready) return null;

  return (
    <>
      {/* Full-viewport builder (SVG + bank + banner + name prompt) */}
      <BuildViewComponent />

      {/* Persistent zoom tip (bottom-right, clear of banner/bank/name prompt) */}
      <div className="map-tip tip-br" role="note">
        <span aria-hidden>🔍</span> Double-click anywhere to zoom and centre on that area.
      </div>

      {/* Screen-top bar */}
      <div className="screen-top">
        <div className="st-left">
          <button className="icon-btn" title="Back to menu" onClick={backToMenu}>
            ←
          </button>
          <div className="brand sm">
            <div className="logo" />
            <h1>GeoBean</h1>
          </div>
        </div>
        <div className="st-right">
          <button
            className={"icon-btn sound-btn" + (settings.sound ? " active" : "")}
            title={"Sound (" + (settings.sound ? "on" : "off") + ")"}
            onClick={toggleSound}
          >
            {settings.sound ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      {/* Completion modal */}
      {done && (
        <BuildResults
          done={done}
          onAgain={handleAgain}
          onMenu={backToMenu}
        />
      )}

      <FxCanvas />
      <Toast />
    </>
  );
}
