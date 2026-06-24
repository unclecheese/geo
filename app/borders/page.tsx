"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePinchGuard } from "@/lib/use-pinch-guard";
import { MODES } from "@/lib/modes";
import { Logic } from "@/lib/logic";
import { DataLayer } from "@/lib/data-layer";
import { useAtlasStore } from "@/store/atlas-store";
import { useBordersStore } from "@/store/borders-store";
import { useData } from "@/components/DataProvider";
import { MapViewComponent } from "@/components/MapView";
import { Autocomplete } from "@/components/Autocomplete";
import { Scorebar } from "@/components/Scorebar";
import { Reveal } from "@/components/Reveal";
import { Results } from "@/components/Results";
import { StatsDashboard } from "@/components/StatsDashboard";
import { Audio2 } from "@/lib/fx";

export default function BordersPage() {
  const router = useRouter();
  const { ready } = useData();
  usePinchGuard();

  const session = useBordersStore((s) => s.session);
  const target = useBordersStore((s) => s.target);
  const required = useBordersStore((s) => s.required);
  const foundIds = useBordersStore((s) => s.foundIds);
  const activeId = useBordersStore((s) => s.activeId);
  const answered = useBordersStore((s) => s.answered);
  const reveal = useBordersStore((s) => s.reveal);
  const finished = useBordersStore((s) => s.finished);

  const start = useBordersStore((s) => s.start);
  const next = useBordersStore((s) => s.next);
  const submitName = useBordersStore((s) => s.submitName);
  const revealAll = useBordersStore((s) => s.revealAll);
  const handleMapClick = useBordersStore((s) => s.handleMapClick);
  const quit = useBordersStore((s) => s.quit);

  const settings = useAtlasStore((s) => s.settings);
  const setSettings = useAtlasStore((s) => s.setSettings);

  const [showStats, setShowStats] = useState(false);
  const [hudHidden, setHudHidden] = useState(false);

  // Start on mount once data is ready; redirect out if the saved mode isn't Borders.
  useEffect(() => {
    if (!ready) return;
    const modes = Logic.sanitizeModes(useAtlasStore.getState().settings.modes);
    if (MODES[modes[0]]?.group !== "borders") {
      router.replace("/");
      return;
    }
    const st = useBordersStore.getState();
    if (!st.active && !st.finished) start();
    return () => useBordersStore.getState().quit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Hide the HUD while the reveal card is open.
  useEffect(() => {
    setHudHidden(answered && !!reveal);
  }, [answered, reveal]);

  // Enter advances to the next country once the reveal is showing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches?.("input")) return;
      if (e.key === "Enter" && answered && reveal) next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answered, reveal, next]);

  if (!ready) return null;

  const backToMenu = () => {
    quit();
    router.push("/", { scroll: false });
  };

  const toggleSound = () => {
    const on = !settings.sound;
    setSettings({ sound: on });
    if (on) {
      Audio2.ensure();
      Audio2.correct();
    }
  };

  const progressText = session ? `${session.asked} / ${session.total}` : "";
  // Naming candidates: any country, since neighbours can sit outside the filter.
  const allNames = [...new Set(DataLayer.countries.map((c) => c.name))];

  return (
    <>
      <MapViewComponent onSelect={handleMapClick} />

      <div className="map-tip" role="note">
        <span aria-hidden>🔍</span> Double-click anywhere to zoom and centre on that area.
      </div>

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

      <div id="hud" className={hudHidden ? "hidden" : ""}>
        <div className="q-top">
          <span className="q-mode">Borders</span>
          <span className="q-progress">{progressText}</span>
        </div>

        <div id="q-body">
          {target && (
            <>
              <div className="q-prompt">
                Name all <span className="em">{required.length}</span>{" "}
                {required.length === 1 ? "country" : "countries"} bordering{" "}
                <span className="em">{target.name}</span>
              </div>
              <div className="q-sub">
                {activeId
                  ? "What country is this?"
                  : "Tap each bordering country to name it — open water isn't clickable"}
              </div>
              <div className="bd-progress">
                <span className="bd-count">
                  {foundIds.size} / {required.length} found
                </span>
                {!activeId && (
                  <button className="bd-reveal" onClick={revealAll}>
                    Reveal answers
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        <div id="q-controls">
          {target && activeId && (
            <Autocomplete key={activeId} candidates={allNames} onSubmit={submitName} />
          )}
        </div>
      </div>

      <Scorebar />
      <Reveal reveal={answered ? reveal : null} onNext={next} />
      <Results
        session={finished ? session : null}
        onAgain={start}
        onStats={() => setShowStats(true)}
        onMenu={backToMenu}
      />
      <StatsDashboard open={showStats} onClose={() => setShowStats(false)} />
    </>
  );
}
