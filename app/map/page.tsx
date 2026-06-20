"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MODES } from "@/lib/modes";
import { Logic } from "@/lib/logic";
import { DataLayer } from "@/lib/data-layer";
import { useAtlasStore } from "@/store/atlas-store";
import { useQuizStore } from "@/store/quiz-store";
import { useData } from "@/components/DataProvider";
import { MapViewComponent } from "@/components/MapView";
import { Scorebar } from "@/components/Scorebar";
import { Reveal } from "@/components/Reveal";
import { Results } from "@/components/Results";
import { StatsDashboard } from "@/components/StatsDashboard";
import { Audio2 } from "@/lib/fx";
import type { Country } from "@/lib/types";

export default function MapPage() {
  const router = useRouter();
  const { ready } = useData();

  const session      = useQuizStore((s) => s.session);
  const current      = useQuizStore((s) => s.current);
  const answered     = useQuizStore((s) => s.answered);
  const reveal       = useQuizStore((s) => s.reveal);
  const finished     = useQuizStore((s) => s.finished);
  const choiceResult = useQuizStore((s) => s.choiceResult);

  const start        = useQuizStore((s) => s.start);
  const next         = useQuizStore((s) => s.next);
  const handleChoice = useQuizStore((s) => s.handleChoice);
  const quit         = useQuizStore((s) => s.quit);

  const settings    = useAtlasStore((s) => s.settings);
  const setSettings = useAtlasStore((s) => s.setSettings);

  const [showStats, setShowStats] = useState(false);
  const [hudHidden, setHudHidden] = useState(false);

  // Start on mount once data is ready; guard against StrictMode double-call.
  useEffect(() => {
    if (!ready) return;
    // If the saved modes aren't map modes, redirect to menu.
    const modes = Logic.sanitizeModes(useAtlasStore.getState().settings.modes);
    const group = MODES[modes[0]]?.group;
    if (group !== "map") {
      router.replace("/");
      return;
    }
    const st = useQuizStore.getState();
    if (!st.active && !st.finished) start();
    return () => { useQuizStore.getState().quit(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Hide HUD while reveal is open (mirrors original UI.showReveal hiding #hud).
  useEffect(() => {
    setHudHidden(answered && !!reveal);
  }, [answered, reveal]);

  // Keyboard: Esc → reset zoom; Enter → next on reveal; 1-4 → pick MC choice.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches?.("input")) return;
      if (e.key === "Escape") {
        import("@/lib/map-view").then(({ MapView }) => { if (MapView._inited) MapView.reset(); });
      } else if (e.key === "Enter" && answered && reveal) {
        next();
      } else if (/^[1-4]$/.test(e.key) && !answered) {
        const btns = document.querySelectorAll<HTMLButtonElement>("#q-controls .choice:not(:disabled)");
        const b = btns[+e.key - 1];
        if (b) b.click();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answered, reveal, next]);

  const backToMenu = () => { quit(); router.push("/"); };

  const toggleHeatmap = () => {
    const on = !settings.heatmap;
    setSettings({ heatmap: on });
    import("@/lib/map-view").then(({ MapView }) => { if (MapView._inited) MapView.refreshColors(); });
  };

  const toggleSound = () => {
    const on = !settings.sound;
    setSettings({ sound: on });
    if (on) { Audio2.ensure(); Audio2.correct(); }
  };

  if (!ready) return null;

  const item = current?.item;
  const mode = current?.mode;

  const progressText = session
    ? session.type === "round"
      ? `${session.asked} / ${session.total}`
      : `Q${session.asked} · endless`
    : "";

  // MC choices for name mode.
  const st = useAtlasStore.getState().settings;
  const activePool = Logic.filterPool(DataLayer.countries, st.region, st.subregion);
  const choices: Country[] = mode === "name" && item ? Logic.makeChoices(item, activePool, 4) : [];

  return (
    <>
      {/* Map fills the viewport */}
      <MapViewComponent />

      {/* Screen-top bar */}
      <div className="screen-top">
        <div className="st-left">
          <button className="icon-btn" title="Back to menu" onClick={backToMenu}>←</button>
          <div className="brand sm">
            <div className="logo" />
            <h1>Atlas</h1>
          </div>
        </div>
        <div className="st-right">
          <button
            className={"icon-btn heatmap-btn" + (settings.heatmap ? " active" : "")}
            title="Mastery heatmap"
            onClick={toggleHeatmap}
          >
            🌡️
          </button>
          <button
            className={"icon-btn sound-btn" + (settings.sound ? " active" : "")}
            title={"Sound (" + (settings.sound ? "on" : "off") + ")"}
            onClick={toggleSound}
          >
            {settings.sound ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      {/* Quiz HUD — question card anchored at bottom-centre */}
      <div id="hud" className={hudHidden ? "hidden" : ""}>
        <div className="q-top">
          <span className="q-mode">{mode ? MODES[mode].label : "—"}</span>
          <span className="q-progress">{progressText}</span>
        </div>

        <div id="q-body">
          {item && mode === "find" && (
            <>
              <div className="q-prompt">
                Find <span className="em">{item.name}</span> on the map
              </div>
              <div className="q-sub">Click the country (zoom in for small ones)</div>
            </>
          )}
          {item && mode === "name" && (
            <>
              <div className="q-prompt">
                Name the <span className="em">highlighted</span> country
              </div>
              <div className="q-sub">It&apos;s glowing on the map</div>
            </>
          )}
        </div>

        <div id="q-controls">
          {mode === "name" && choices.length > 0 && (
            <div className="choices">
              {choices.map((c) => {
                let cls = "choice";
                if (answered && choiceResult) {
                  if (c.id === choiceResult.correctId) cls += " correct";
                  else if (c.id === choiceResult.pickedId) cls += " wrong";
                }
                return (
                  <button
                    key={c.id}
                    className={cls}
                    disabled={answered}
                    onClick={() => handleChoice(c)}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
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
