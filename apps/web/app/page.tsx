"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MODES,
  Logic,
  DataLayer,
  useAtlasStore,
  toast,
  type BuildDifficulty,
  type ModeGroup,
  type ModeId,
  type QuizDifficulty,
} from "@geobean/core";
import { BuildGraph } from "@/lib/build-graph";
import { useHydrated } from "@/lib/use-hydrated";
import { useData } from "@/components/DataProvider";
import { Audio2 } from "@/lib/fx";
import { StatsDashboard } from "@/components/StatsDashboard";

// The quiz families, each a card on the landing screen.
type CardType = ModeGroup; // "map" | "expert" | "borders" | "build"
const CARDS: { type: CardType; icon: string; title: string; tag: string; blurb: string }[] = [
  { type: "map", icon: "🗺️", title: "Map identification", tag: "Find it · name it", blurb: "Pin a country on the world map, or name the one that's glowing." },
  { type: "expert", icon: "🚩", title: "Quiz", tag: "Flags · capitals · borders", blurb: "Rapid-fire flags, capitals, and framed borders. No world map — just recall." },
  { type: "build", icon: "🧩", title: "Puzzle", tag: "Build a continent", blurb: "Drag every country into place and rebuild a continent." },
];

const MAP_MODES: ModeId[] = ["find", "name"];
const QUIZ_MODES: ModeId[] = ["capital", "flag"];

const DIFFICULTY: { id: BuildDifficulty; label: string; blurb: string }[] = [
  { id: "easy", label: "Easy", blurb: "Country names are shown on the tiles." },
  { id: "hard", label: "Difficult", blurb: "No names — name each country as you place it." },
  { id: "expert", label: "Expert", blurb: "No names — name the country and its capital on placement." },
];

export default function MenuPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const { ready } = useData();

  const settings = useAtlasStore((s) => s.settings);
  const setSettings = useAtlasStore((s) => s.setSettings);
  const exportState = useAtlasStore((s) => s.exportState);
  const importState = useAtlasStore((s) => s.importState);
  const resetProgress = useAtlasStore((s) => s.resetProgress);

  const [selected, setSelected] = useState<CardType | null>(null);
  const [showStats, setShowStats] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isBuild = selected === "build";

  // Region options: build is restricted to supported continents (no "all").
  const allRegions = ready
    ? Array.from(new Set(DataLayer.countries.map((c) => c.region))).sort()
    : [];
  const regionOptions = isBuild ? [...BuildGraph.SUPPORTED] : allRegions;

  // Open a card → normalise the mode set to that family and show its settings.
  const openCard = (type: CardType) => {
    Audio2.ensure();
    const patch: Partial<typeof settings> = {};
    if (type === "map") {
      const keep = settings.modes.filter((m) => MAP_MODES.includes(m));
      patch.modes = keep.length ? keep : ["find", "name"];
    } else if (type === "expert") {
      // Quiz card hosts capital/flag (combinable) and border (exclusive). Keep a
      // saved border selection; otherwise keep any capital/flag, defaulting to both.
      if (settings.modes.includes("border")) {
        patch.modes = ["border"];
      } else {
        const keep = settings.modes.filter((m) => QUIZ_MODES.includes(m));
        patch.modes = keep.length ? keep : ["capital", "flag"];
      }
    } else {
      patch.modes = ["build"];
      // Build needs exactly one supported continent; coerce the selection down.
      const current = settings.regions[0];
      if (!current || !(BuildGraph.SUPPORTED as readonly string[]).includes(current)) {
        patch.regions = [BuildGraph.SUPPORTED[0]];
      } else {
        patch.regions = [current];
      }
    }
    setSettings(patch);
    setSelected(type);
  };

  // Toggle a mode within the Quiz card. Capitals + Flags combine freely and
  // interleave; Borders is a standalone quiz, so selecting it clears the others
  // (and selecting either of them clears Borders).
  const toggleMode = (id: ModeId) => {
    if (id === "border") {
      const on = settings.modes.includes("border");
      setSettings({ modes: on ? ["capital"] : ["border"] });
      return;
    }
    const group = MODES[id].group;
    const set = new Set(
      settings.modes.filter((m) => MODES[m]?.group === group && m !== "border")
    );
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setSettings({ modes: [...set] });
  };

  // Build: single continent — replace the whole selection.
  const onBuildRegion = (region: string) => setSettings({ regions: [region] });

  // Map/Quiz region selector. Empty = whole world, shown as every region ticked.
  // Tapping from the all-state narrows to just that region; otherwise it toggles.
  // The set can never be emptied to nothing — dropping the last one (or picking
  // every region) normalises back to [] (whole world, all ticked).
  const regionOn = (r: string) =>
    hydrated && (settings.regions.length === 0 || settings.regions.includes(r));

  const toggleRegion = (region: string) => {
    let next: string[];
    if (settings.regions.length === 0) {
      next = [region]; // narrowing from "all" → focus this one
    } else if (settings.regions.includes(region)) {
      next = settings.regions.filter((r) => r !== region);
    } else {
      next = [...settings.regions, region];
    }
    // A full set (or an emptied one) is just the whole world — store the canonical [].
    if (next.length === 0 || next.length === regionOptions.length) next = [];
    const nowOn = next.length === 0 || next.includes(region);
    Audio2.tick(nowOn);
    setSettings({ regions: next });
  };

  // "All regions": re-select the whole world (every region ticked).
  const selectAllRegions = () => {
    Audio2.tick(true);
    setSettings({ regions: [] });
  };

  const setDifficulty = (d: BuildDifficulty) =>
    setSettings({ buildDifficulty: d, showNames: d === "easy" });

  const setQuizDifficulty = (d: QuizDifficulty) => setSettings({ quizDifficulty: d });

  const start = () => {
    Audio2.ensure();
    const modes = Logic.sanitizeModes(settings.modes);
    if (modes.join() !== settings.modes.join()) setSettings({ modes });
    const grp = MODES[modes[0]].group;
    if (grp === "expert") router.push("/quiz", { scroll: false });
    else if (grp === "map") router.push("/map", { scroll: false });
    else if (grp === "borders") router.push("/borders", { scroll: false });
    else router.push("/build", { scroll: false });
  };

  const doExport = () => {
    const blob = new Blob([exportState()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "geobean-progress.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const doImport = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importState(String(reader.result));
        toast("Progress imported.", "good");
      } catch {
        toast("Couldn't read that file.", "bad");
      }
    };
    reader.readAsText(file);
  };

  const doReset = () => {
    if (confirm("Reset all progress and settings?")) {
      resetProgress();
      toast("Progress reset.", "good");
    }
  };

  const toggleSound = () => {
    const next = !settings.sound;
    setSettings({ sound: next });
    if (next) { Audio2.ensure(); Audio2.correct(); }
  };

  const modeOn = (id: ModeId) => hydrated && settings.modes.includes(id);
  const card = CARDS.find((c) => c.type === selected);

  // Map/Quiz require at least one mode switched on. In the Quiz card, Borders (its
  // own group) also counts as a valid selection.
  const noModes =
    hydrated &&
    (selected === "map" || selected === "expert") &&
    !settings.modes.some(
      (m) => MODES[m]?.group === selected || (selected === "expert" && m === "border")
    );

  /* ---- shared sub-blocks ---- */
  // Build: one continent only — a single-select dropdown, as before.
  const BuildRegionBlock = (
    <div className="section">
      <h3>Continent</h3>
      <select value={settings.regions[0] ?? ""} onChange={(e) => onBuildRegion(e.target.value)} disabled={!ready}>
        {regionOptions.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>
    </div>
  );

  // Map/Quiz: a multi-select region grid. Empty = whole world, shown as every
  // region ticked; "All regions" is a distinct toggle-all that re-selects the
  // lot. A full explicit set is normalised to [], so "all" always reads as on.
  const allRegionsOn =
    hydrated && (settings.regions.length === 0 || settings.regions.length === regionOptions.length);
  const MultiRegionBlock = (
    <div className="section">
      <h3>Regions</h3>
      <div className="border-grid multi">
        <button
          className={"bsel all" + (allRegionsOn ? " sel" : "")}
          onClick={selectAllRegions}
          disabled={!ready}
        >
          {allRegionsOn ? "✓ " : ""}🌍 All regions
        </button>
        {regionOptions.map((r) => (
          <button
            key={r}
            className={"bsel" + (regionOn(r) ? " sel" : "")}
            onClick={() => toggleRegion(r)}
            disabled={!ready}
          >
            {regionOn(r) ? "✓ " : ""}{r}
          </button>
        ))}
      </div>
      <p className="hint-line">Everything&apos;s on by default. Tap a region to focus it, then tap more to add.</p>
    </div>
  );

  const RegionBlock = isBuild ? BuildRegionBlock : MultiRegionBlock;

  // Easy = multiple choice, Difficult = type the answer (map name + quiz).
  const DifficultyBlock = (
    <div className="section">
      <h3>Difficulty</h3>
      <div className="seg">
        <button
          className={hydrated && settings.quizDifficulty === "easy" ? "on" : ""}
          onClick={() => setQuizDifficulty("easy")}
        >
          Easy
        </button>
        <button
          className={hydrated && settings.quizDifficulty === "difficult" ? "on" : ""}
          onClick={() => setQuizDifficulty("difficult")}
        >
          Difficult
        </button>
      </div>
      <p className="hint-line">Easy = multiple choice. Difficult = type the answer.</p>
    </div>
  );

  const LengthBlock = (
    <div className="section">
      <h3>Length</h3>
      <div className="seg">
        <button className={hydrated && settings.session === "round" ? "on" : ""} onClick={() => setSettings({ session: "round" })}>
          Set number
        </button>
        <button className={hydrated && settings.session === "around" ? "on" : ""} onClick={() => setSettings({ session: "around" })}>
          Around the world 🌍
        </button>
      </div>
      {settings.session === "round" && (
        <div className="row" style={{ marginTop: 10 }}>
          <span style={{ fontSize: "12.5px", color: "var(--ink-dim)", flex: 1 }}>Questions</span>
          <select style={{ width: 90 }} value={settings.roundLen} onChange={(e) => setSettings({ roundLen: +e.target.value })}>
            <option>10</option>
            <option>15</option>
            <option>20</option>
          </select>
        </div>
      )}
      {settings.session === "around" && (
        <p className="hint-line">Every country in your selection, once. The lap ends when you&apos;ve seen them all.</p>
      )}
      <label className="toggle">
        <div>Session timer <small>Times your whole run — answer at your own pace</small></div>
        <span className="switch">
          <input type="checkbox" checked={hydrated ? settings.timed : false} onChange={(e) => setSettings({ timed: e.target.checked })} />
          <span />
        </span>
      </label>
    </div>
  );

  return (
    <section className="screen-menu">
      <div className="menu-hero">
        <div className="logo" />
        <h1>GeoBean</h1>
        <p>{selected ? card?.blurb : "Compulsive geography."}</p>
      </div>

      {/* Landing: the three quiz cards */}
      {!selected && (
        <div className="quiz-cards">
          {CARDS.map((c, i) => (
            <button key={c.type} className={`quiz-card qc-${c.type}`} onClick={() => openCard(c.type)} disabled={!ready}>
              <span className="qc-no" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
              <span className="qc-icon" aria-hidden>{c.icon}</span>
              <span className="qc-tag">{c.tag}</span>
              <span className="qc-title">{c.title}</span>
              <span className="qc-blurb">{c.blurb}</span>
              <span className="qc-go">Play ▸</span>
            </button>
          ))}
        </div>
      )}

      {/* Drill-down: settings for the chosen card */}
      {selected && (
        <div className="menu-card">
          <button className="settings-back" onClick={() => setSelected(null)}>← All quizzes</button>
          <div className="settings-head">
            <span className="qc-icon sm" aria-hidden>{card?.icon}</span>
            <h2>{card?.title}</h2>
          </div>

          {selected === "map" && (
            <div className="section">
              <h3>What to test</h3>
              <label className="toggle">
                <div>📍 Find on map <small>Pin the named country on the world map</small></div>
                <span className="switch">
                  <input type="checkbox" checked={modeOn("find")} onChange={() => toggleMode("find")} />
                  <span />
                </span>
              </label>
              <label className="toggle">
                <div>🏷️ Name the country <small>Name the country that&apos;s glowing</small></div>
                <span className="switch">
                  <input type="checkbox" checked={modeOn("name")} onChange={() => toggleMode("name")} />
                  <span />
                </span>
              </label>
              {noModes && <p className="hint-line">Switch on at least one to start.</p>}
            </div>
          )}

          {selected === "expert" && (
            <div className="section">
              <h3>What to test</h3>
              <label className="toggle">
                <div>🚩 Flags <small>Identify the country from its flag</small></div>
                <span className="switch">
                  <input type="checkbox" checked={modeOn("flag")} onChange={() => toggleMode("flag")} />
                  <span />
                </span>
              </label>
              <label className="toggle">
                <div>🏛️ Capitals <small>Name each country&apos;s capital city</small></div>
                <span className="switch">
                  <input type="checkbox" checked={modeOn("capital")} onChange={() => toggleMode("capital")} />
                  <span />
                </span>
              </label>
              <label className="toggle">
                <div>🧭 Borders <small>Name the neighbours in a framed picture (its own quiz)</small></div>
                <span className="switch">
                  <input type="checkbox" checked={modeOn("border")} onChange={() => toggleMode("border")} />
                  <span />
                </span>
              </label>
              {noModes && <p className="hint-line">Switch on at least one to start.</p>}
            </div>
          )}

          {RegionBlock}

          {(selected === "map" || selected === "expert") && DifficultyBlock}

          {!isBuild && LengthBlock}

          {isBuild && (
            <>
              <div className="section">
                <h3>Difficulty</h3>
                <div className="seg seg-3">
                  {DIFFICULTY.map((d) => (
                    <button key={d.id} className={hydrated && settings.buildDifficulty === d.id ? "on" : ""} onClick={() => setDifficulty(d.id)}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <p className="hint-line">{DIFFICULTY.find((d) => d.id === settings.buildDifficulty)?.blurb}</p>
              </div>
              <div className="section">
                <label className="toggle">
                  <div>Randomise rotation <small>Pieces start rotated — you straighten them (coming soon)</small></div>
                  <span className="switch">
                    <input type="checkbox" checked={hydrated ? settings.rotateRandom : false} onChange={(e) => setSettings({ rotateRandom: e.target.checked })} />
                    <span />
                  </span>
                </label>
                <label className="toggle">
                  <div>Session timer <small>Times your whole build</small></div>
                  <span className="switch">
                    <input type="checkbox" checked={hydrated ? settings.timed : false} onChange={(e) => setSettings({ timed: e.target.checked })} />
                    <span />
                  </span>
                </label>
              </div>
            </>
          )}

          <div className="section" style={{ marginBottom: 0 }}>
            <button className="btn btn-go" onClick={start} disabled={!ready || noModes}>
              {isBuild ? "Build it ▸" : "Start ▸"}
            </button>
          </div>
        </div>
      )}

      <div className="menu-footer">
        <button className="btn ghost small" onClick={() => setShowStats(true)}>📊 Stats</button>
        <button className="btn ghost small" onClick={doExport}>Export</button>
        <button className="btn ghost small" onClick={() => fileRef.current?.click()}>Import</button>
        <button className="btn ghost small" title="Reset all progress" onClick={doReset}>Reset</button>
        <button
          className={"btn ghost small" + (hydrated && settings.sound ? " active" : "")}
          title={"Sound (" + (settings.sound ? "on" : "off") + ")"}
          onClick={toggleSound}
        >
          {hydrated && settings.sound ? "🔊" : "🔇"}
        </button>
        <input ref={fileRef} type="file" accept="application/json" hidden onChange={(e) => doImport(e.target.files?.[0])} />
      </div>

      <StatsDashboard open={showStats} onClose={() => setShowStats(false)} />
    </section>
  );
}
