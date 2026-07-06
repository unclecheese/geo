"use client";

import type { BuildDoneSummary } from "@/store/build-store";
import { Logic } from "@/lib/logic";

interface Props {
  done: BuildDoneSummary | null;
  onAgain: () => void;
  onMenu: () => void;
}

export function BuildResults({ done, onAgain, onMenu }: Props) {
  if (!done) return null;

  const kpis: { v: string; cls: string; l: string }[] = [];
  if (done.timed)
    kpis.push({ v: Logic.fmtDuration(done.elapsedMs), cls: "accent", l: "Time" });
  kpis.push({ v: String(done.mistakes), cls: "warn", l: "Mistakes" });
  kpis.push({ v: String(done.n), cls: "good", l: "Placed" });

  return (
    <div id="build-done-back" className="show">
      <div className="modal" style={{ position: "relative" }}>
        <h2 id="bd-title">Continent complete! 🎉</h2>
        <div className="sub" id="bd-sub">
          You assembled {done.continent} — all {done.n} countries.
        </div>
        <div className="grid-stats" id="bd-kpis">
          {kpis.map((k) => (
            <div key={k.l} className="kpi">
              <div className={"v " + k.cls}>{k.v}</div>
              <div className="l">{k.l}</div>
            </div>
          ))}
        </div>
        <div className="split">
          <button className="btn" id="bd-again" onClick={onAgain}>
            Build again
          </button>
          <button className="btn ghost" id="bd-menu" onClick={onMenu}>
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}
