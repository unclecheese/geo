"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MODES } from "@/lib/modes";
import { Logic } from "@/lib/logic";
import { DataLayer } from "@/lib/data-layer";
import { BuildGraph } from "@/lib/build-graph";
import type { BuildDifficulty, ModeGroup, ModeId, QuizDifficulty } from "@/lib/types";
import { useAtlasStore } from "@/store/atlas-store";
import { useHydrated } from "@/lib/use-hydrated";
import { useData } from "@/components/DataProvider";
import { Audio2 } from "@/lib/fx";
import { toast } from "@/store/toast-store";
import { StatsDashboard } from "@/components/StatsDashboard";

// The quiz families, each a card on the landing screen.
type CardType = ModeGroup; // "map" | "expert" | "borders" | "build"
const CARDS: { type: CardType; icon: string; title: string; tag: string; blurb: string }[] = [
  { type: "map", icon: "🗺️", title: "Map identification", tag: "Find it · name it", blurb: "Pin a country on the world map, or name the one that's glowing." },
  { type: "expert", icon: "🚩", title: "Quiz", tag: "Flags · capitals", blurb: "Rapid-fire flags and capitals. No map — just recall." },
  { type: "borders", icon: "🧭", title: "Borders", tag: "Name the neighbours", blurb: "Zoom in on a country and name every one that borders it." },
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
  // Subregion options reflect the selected regions (or every region when none
  // are selected). Multi-select for map/quiz; build stays single-continent.
  const subOptions = ready
    ? Array.from(
      new Set(
        DataLayer.countries
          .filter((c) => !settings.regions.length || settings.regions.includes(c.region))
          .map((c) => c.subregion as string)
          .filter(Boolean)
      )
    ).sort()
    : [];

  // Open a card → normalise the mode set to that family and show its settings.
  const openCard = (type: CardType) => {
    Audio2.ensure();
    const patch: Partial<typeof settings> = {};
    if (type === "map") {
      const keep = settings.modes.filter((m) => MAP_MODES.includes(m));
      patch.modes = keep.length ? keep : ["find", "name"];
    } else if (type === "expert") {
      const keep = settings.modes.filter((m) => QUIZ_MODES.includes(m));
      patch.modes = keep.length ? keep : ["capital", "flag"];
    } else if (type === "borders") {
      patch.modes = ["border"];
    } else {
      patch.modes = ["build"];
      // Build needs exactly one supported continent; coerce the selection down.
      const current = settings.regions[0];
      if (!current || !(BuildGraph.SUPPORTED as readonly string[]).includes(current)) {
        patch.regions = [BuildGraph.SUPPORTED[0]];
      } else {
        patch.regions = [current];
      }
      patch.subregions = [];
    }
    setSettings(patch);
    setSelected(type);
  };

  // Toggle a mode within the active family. May leave zero selected — the Start
  // button is disabled in that case (see `noModes`).
  const toggleMode = (id: ModeId) => {
    const group = MODES[id].group;
    const set = new Set(settings.modes.filter((m) => MODES[m]?.group === group));
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setSettings({ modes: [...set] });
  };

  // Build: single continent — replace the whole selection, clear subregions.
  const onBuildRegion = (region: string) => setSettings({ regions: [region], subregions: [] });

  // Map/Quiz: toggle a region in/out. Dropping a region also drops any of its
  // subregions so the two selections stay consistent.
  const toggleRegion = (region: string) => {
    const has = settings.regions.includes(region);
    const regions = has
      ? settings.regions.filter((r) => r !== region)
      : [...settings.regions, region];
    const inScope = new Set(
      DataLayer.countries
        .filter((c) => !regions.length || regions.includes(c.region))
        .map((c) => c.subregion as string)
    );
    const subregions = settings.subregions.filter((s) => inScope.has(s));
    setSettings({ regions, subregions });
  };

  const toggleSubregion = (sub: string) => {
    const has = settings.subregions.includes(sub);
    setSettings({
      subregions: has
        ? settings.subregions.filter((s) => s !== sub)
        : [...settings.subregions, sub],
    });
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

  // Map/Quiz require at least one mode switched on; build always has "build".
  const noModes =
    hydrated &&
    (selected === "map" || selected === "expert") &&
    !settings.modes.some((m) => MODES[m]?.group === selected);

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

  // Map/Quiz: multi-select toggle grids. An empty selection means the whole
  // world; "All regions" selects everything explicitly so you can then deselect
  // the few you want to exclude (e.g. all subregions except the Caribbean).
  // Both empty and a full set filter identically, so "all" reads as selected
  // in either case (mirrored for subregions).
  const allRegionsOn =
    hydrated && (settings.regions.length === 0 || settings.regions.length === regionOptions.length);
  const allSubsOn =
    hydrated &&
    (settings.subregions.length === 0 || settings.subregions.length === subOptions.length);
  const MultiRegionBlock = (
    <>
      <div className="section">
        <h3>Regions</h3>
        <div className="border-grid multi">
          <button
            className={"bsel all" + (allRegionsOn ? " sel" : "")}
            onClick={() => setSettings({ regions: [...regionOptions], subregions: [] })}
            disabled={!ready}
          >
            🌍 All regions
          </button>
          {regionOptions.map((r) => (
            <button
              key={r}
              className={"bsel" + (hydrated && settings.regions.includes(r) ? " sel" : "")}
              onClick={() => toggleRegion(r)}
              disabled={!ready}
            >
              {r}
            </button>
          ))}
        </div>
        <p className="hint-line">None selected = whole world. Or tap All, then deselect a region to exclude it.</p>
      </div>
      {subOptions.length > 0 && (
        <div className="section">
          <h3>Subregions</h3>
          <div className="border-grid multi">
            <button
              className={"bsel all" + (allSubsOn ? " sel" : "")}
              onClick={() => setSettings({ subregions: [...subOptions] })}
              disabled={!ready}
            >
              All subregions
            </button>
            {subOptions.map((s) => (
              <button
                key={s}
                className={"bsel" + (hydrated && settings.subregions.includes(s) ? " sel" : "")}
                onClick={() => toggleSubregion(s)}
                disabled={!ready}
              >
                {s}
              </button>
            ))}
          </div>
          <p className="hint-line">
            Tap a few to narrow, or tap All subregions then deselect any you want to exclude — e.g. everything except the Caribbean.
          </p>
        </div>
      )}
    </>
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
