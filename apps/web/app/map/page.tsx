"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePinchGuard } from "@/lib/use-pinch-guard";
import { MODES, Logic, DataLayer, useAtlasStore, useQuizStore } from "@geobean/core";
import { useData } from "@/components/DataProvider";
import { MapViewComponent } from "@/components/MapView";
import { Scorebar } from "@/components/Scorebar";
import { Reveal } from "@/components/Reveal";
import { Results } from "@/components/Results";
import { Choices } from "@/components/Choices";
import { StatsDashboard } from "@/components/StatsDashboard";
import { Autocomplete } from "@/components/Autocomplete";
import { Audio2 } from "@/lib/fx";

export default function MapPage() {
  const router = useRouter();
  const { ready } = useData();
  usePinchGuard();

  const session      = useQuizStore((s) => s.session);
  const current      = useQuizStore((s) => s.current);
  const answered     = useQuizStore((s) => s.answered);
  const reveal       = useQuizStore((s) => s.reveal);
  const finished     = useQuizStore((s) => s.finished);
  const choiceResult = useQuizStore((s) => s.choiceResult);
  const choices      = useQuizStore((s) => s.choices);
  const hintLevel    = useQuizStore((s) => s.hintLevel);
  const eliminatedIds = useQuizStore((s) => s.eliminatedIds);
  const revealedCount = useQuizStore((s) => s.revealedCount);

  const start        = useQuizStore((s) => s.start);
  const next         = useQuizStore((s) => s.next);
  const handleChoice = useQuizStore((s) => s.handleChoice);
  const handleTyped  = useQuizStore((s) => s.handleTyped);
  const handleMapSelect = useQuizStore((s) => s.handleMapSelect);
  const useHint      = useQuizStore((s) => s.useHint);
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

  const backToMenu = () => { quit(); router.push("/", { scroll: false }); };

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
  const difficult = settings.quizDifficulty === "difficult";

  const progressText = session ? `${session.asked} / ${session.total}` : "";
  const progressPct =
    session && session.total ? `${Math.round((session.asked / session.total) * 100)}%` : "0%";

  // Difficult name mode types the answer — candidates are the active pool's names.
  const activePool = Logic.filterPool(DataLayer.countries, settings.regions);
  const nameCandidates = [...new Set(activePool.map((c) => c.name))];

  // The hint button is a low-key escape hatch: it always reads "Show hint" (or
  // "Show another hint" once one's been used) and disables when the mode's hints
  // run out. What a hint reveals is mode-specific — location clues for find, an
  // eliminated option for easy name, a hangman letter for difficult name.
  const canHint = !answered && (mode === "find" || mode === "name");
  let hintUsed = false;
  let hintExhausted = false;
  if (mode === "find") {
    hintUsed = hintLevel > 0;
    hintExhausted = hintLevel >= 3;
  } else if (mode === "name" && !difficult && item) {
    hintUsed = eliminatedIds.length > 0;
    hintExhausted = choices.every((c) => c.id === item.id || eliminatedIds.includes(c.id));
  } else if (mode === "name" && difficult && item) {
    // revealedCount 0 = hangman hidden, 1 = all blanks, k = k-1 letters shown.
    hintUsed = revealedCount > 0;
    hintExhausted = revealedCount >= Logic.letterCount(item.name) + 1;
  }
  const hintLabel = hintUsed ? "Show another hint" : "Show hint";

  // Cumulative location hints for find mode, driven by hintLevel (0..3).
  const findHints: string[] = [];
  if (mode === "find" && item) {
    if (hintLevel >= 1) findHints.push(`Region: ${item.region}`);
    if (hintLevel >= 2 && item.subregion) findHints.push(`Subregion: ${item.subregion}`);
    if (hintLevel >= 3) {
      const names = item.neighbours.map((n) => n.name);
      findHints.push(names.length ? `Borders: ${names.join(", ")}` : "Island — no land borders");
    }
  }

  return (
    <>
      {/* Map fills the viewport */}
      <MapViewComponent onSelect={handleMapSelect} />

      {/* Persistent map tip */}
      <div className="map-tip" role="note">
        <span aria-hidden>🔍</span> Double-click anywhere to zoom and centre on that area.
      </div>

      {/* Screen-top bar */}
      <div className="screen-top">
        <div className="st-left">
          <button className="icon-btn" title="Back to menu" onClick={backToMenu}>←</button>
          <div className="brand sm">
            <div className="logo" />
            <h1>GeoBean</h1>
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
        <div className="q-bar" aria-hidden>
          <div className="q-bar-fill" style={{ width: progressPct }} />
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
              {difficult && revealedCount > 0 && (
                <div className="hangman" aria-label="Answer letters">
                  {Logic.revealName(item.name, revealedCount - 1)}
                </div>
              )}
            </>
          )}
          {findHints.length > 0 && (
            <ul className="hint-list">
              {findHints.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
        </div>

        <div id="q-controls">
          {mode === "name" && !difficult && choices.length > 0 && (
            <Choices
              choices={choices}
              answered={answered}
              choiceResult={choiceResult}
              eliminatedIds={eliminatedIds}
              label={(c) => c.name}
              onPick={handleChoice}
            />
          )}
          {mode === "name" && difficult && item && (
            <Autocomplete
              key={item.id + ":name"}
              candidates={nameCandidates}
              onSubmit={handleTyped}
            />
          )}
          {canHint && (
            <button className="hint-btn" onClick={useHint} disabled={hintExhausted}>
              💡 {hintExhausted ? "No more hints" : hintLabel}
            </button>
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
