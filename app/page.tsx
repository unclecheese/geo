"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MODES } from "@/lib/modes";
import { Logic } from "@/lib/logic";
import { DataLayer } from "@/lib/data-layer";
import { BuildGraph } from "@/lib/build-graph";
import type { ModeGroup, ModeId } from "@/lib/types";
import { useAtlasStore } from "@/store/atlas-store";
import { useHydrated } from "@/lib/use-hydrated";
import { useData } from "@/components/DataProvider";
import { Audio2 } from "@/lib/fx";
import { toast } from "@/store/toast-store";
import { StatsDashboard } from "@/components/StatsDashboard";

const GROUP_TITLES: { group: ModeGroup; title: string }[] = [
  { group: "map", title: "On the world map" },
  { group: "expert", title: "Expert mode · no map" },
  { group: "build", title: "Build a continent" },
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

  const [showStats, setShowStats] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // The active mode group is the one all selected modes share.
  const currentGroup: ModeGroup =
    settings.modes.length && MODES[settings.modes[0]] ? MODES[settings.modes[0]].group : "map";
  const isBuild = currentGroup === "build";

  // Region options depend on group: build is restricted to supported continents.
  const allRegions = ready
    ? Array.from(new Set(DataLayer.countries.map((c) => c.region))).sort()
    : [];
  const regionOptions = isBuild ? [...BuildGraph.SUPPORTED] : allRegions;
  const subOptions = ready
    ? Array.from(
        new Set(
          DataLayer.countries
            .filter((c) => settings.region === "all" || c.region === settings.region)
            .map((c) => c.subregion as string)
        )
      ).sort()
    : [];

  const toggleMode = (id: ModeId) => {
    const grp = MODES[id].group;
    const set = new Set(settings.modes);
    const curGrp = set.size ? MODES[[...set][0]].group : grp;
    if (curGrp !== grp) set.clear();
    if (set.has(id)) {
      if (set.size > 1) set.delete(id);
    } else {
      set.add(id);
    }
    const modes = [...set];
    const patch: Partial<typeof settings> = { modes };
    // Switching into build coerces the region to a supported continent.
    if (grp === "build" && !(BuildGraph.SUPPORTED as readonly string[]).includes(settings.region)) {
      patch.region = BuildGraph.SUPPORTED[0];
    }
    setSettings(patch);
  };

  const onRegionChange = (region: string) => {
    setSettings({ region, subregion: "all" });
  };

  const start = () => {
    Audio2.ensure();
    const modes = Logic.sanitizeModes(settings.modes);
    if (modes.join() !== settings.modes.join()) setSettings({ modes });
    const grp = MODES[modes[0]].group;
    if (grp === "expert") router.push("/quiz", { scroll: false });
    else if (grp === "map") router.push("/map", { scroll: false });
    else router.push("/build", { scroll: false });
  };

  const doExport = () => {
    const blob = new Blob([exportState()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "atlas-progress.json";
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
    if (next) {
      Audio2.ensure();
      Audio2.correct();
    }
  };

  const onSet = new Set(settings.modes);

  return (
    <section className="screen-menu">
      <div className="menu-hero">
        <div className="logo" />
        <h1>
          Atlas <span>· geography trainer</span>
        </h1>
        <p>Pick a quiz, set your parameters, and go.</p>
      </div>

      <div className="menu-card">
        <div className="section">
          <h3>Choose your quiz</h3>
          {GROUP_TITLES.map(({ group, title }) => (
            <div className="mode-group" key={group}>
              <h4>{title}</h4>
              <div className="chips">
                {Object.values(MODES)
                  .filter((m) => m.group === group)
                  .map((m) => (
                    <button
                      key={m.id}
                      className={"chip" + (hydrated && onSet.has(m.id) ? " on" : "")}
                      onClick={() => toggleMode(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </div>

        <div className="section">
          <h3>Continent</h3>
          <select
            value={settings.region}
            onChange={(e) => onRegionChange(e.target.value)}
            disabled={!ready}
          >
            {!isBuild && <option value="all">All continents</option>}
            {regionOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {!isBuild && (
          <div className="section">
            <h3>Subregion</h3>
            <select
              value={subOptions.includes(settings.subregion) ? settings.subregion : "all"}
              onChange={(e) => setSettings({ subregion: e.target.value })}
              disabled={!ready}
            >
              <option value="all">All subregions</option>
              {subOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        {!isBuild && (
          <div className="section">
            <h3>Session</h3>
            <div className="seg">
              {(["round", "endless"] as const).map((v) => (
                <button
                  key={v}
                  className={hydrated && settings.session === v ? "on" : ""}
                  onClick={() => setSettings({ session: v })}
                >
                  {v === "round" ? "Round" : "Endless"}
                </button>
              ))}
            </div>
            <div
              className="row"
              style={{ marginTop: 8, opacity: settings.session === "round" ? 1 : 0.4 }}
            >
              <span style={{ fontSize: "12.5px", color: "var(--ink-dim)", flex: 1 }}>Questions</span>
              <select
                style={{ width: 90 }}
                value={settings.roundLen}
                onChange={(e) => setSettings({ roundLen: +e.target.value })}
              >
                <option>10</option>
                <option>15</option>
                <option>20</option>
              </select>
            </div>
            <label className="toggle">
              <div>
                Session timer{" "}
                <small>Times your whole run — answer at your own pace</small>
              </div>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={hydrated ? settings.timed : false}
                  onChange={(e) => setSettings({ timed: e.target.checked })}
                />
                <span />
              </span>
            </label>
          </div>
        )}

        {isBuild && (
          <div className="section">
            <h3>Session</h3>
            <label className="toggle">
              <div>
                Show names{" "}
                <small>Off: name each country after placing it to earn credit</small>
              </div>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={hydrated ? settings.showNames : true}
                  onChange={(e) => setSettings({ showNames: e.target.checked })}
                />
                <span />
              </span>
            </label>
          </div>
        )}

        <div className="section" style={{ marginBottom: 0 }}>
          <button className="btn" onClick={start} disabled={!ready}>
            {isBuild ? "Build continent ▸" : "Start session ▸"}
          </button>
        </div>
      </div>

      <div className="menu-footer">
        <button className="btn ghost small" onClick={() => setShowStats(true)}>
          📊 Stats
        </button>
        <button className="btn ghost small" onClick={doExport}>
          Export
        </button>
        <button className="btn ghost small" onClick={() => fileRef.current?.click()}>
          Import
        </button>
        <button className="btn ghost small" title="Reset all progress" onClick={doReset}>
          Reset
        </button>
        <button
          className={"btn ghost small" + (hydrated && settings.sound ? " active" : "")}
          title={"Sound (" + (settings.sound ? "on" : "off") + ")"}
          onClick={toggleSound}
        >
          {hydrated && settings.sound ? "🔊" : "🔇"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => doImport(e.target.files?.[0])}
        />
      </div>

      <StatsDashboard open={showStats} onClose={() => setShowStats(false)} />
    </section>
  );
}
