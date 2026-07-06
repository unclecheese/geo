"use client";

import { BOX_COLORS, DataLayer, useAtlasStore } from "@geobean/core";
import { Sparkline } from "@/components/Sparkline";

interface StatsDashboardProps {
  open: boolean;
  onClose: () => void;
}

// Full progress dashboard modal. Ported from UI.showStats: KPIs, Leitner mastery
// boxes, response-time + streak sparklines, accuracy-by-region bars, weakest items.
export function StatsDashboard({ open, onClose }: StatsDashboardProps) {
  const stats = useAtlasStore((s) => s.stats);
  const history = useAtlasStore((s) => s.history);
  const leitner = useAtlasStore((s) => s.leitner);

  if (!open) return null;

  const acc = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;

  // distinct items by their max box across modes
  const itemBox: Record<string, number> = {};
  for (const k in leitner) {
    const id = k.split(":")[0];
    itemBox[id] = Math.max(itemBox[id] || 1, leitner[k].box);
  }
  const boxCounts = [0, 0, 0, 0, 0];
  Object.values(itemBox).forEach((b) => boxCounts[b - 1]++);
  const mastered = Object.values(itemBox).filter((b) => b >= 5).length;

  // accuracy by region
  const reg: Record<string, { a: number; c: number }> = {};
  history.forEach((h) => {
    reg[h.region] = reg[h.region] || { a: 0, c: 0 };
    reg[h.region].a++;
    if (h.correct) reg[h.region].c++;
  });
  const regKeys = Object.keys(reg).sort();

  // weakest items by miss count
  const miss: Record<string, number> = {};
  history.forEach((h) => {
    if (!h.correct) miss[h.id] = (miss[h.id] || 0) + 1;
  });
  const weak = Object.entries(miss)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);

  return (
    <div className="modal-back show" id="stats-back">
      <div className="modal" style={{ position: "relative" }}>
        <button className="close-x" onClick={onClose}>
          ×
        </button>
        <h2>Your progress</h2>
        <div className="sub">
          {stats.answered
            ? `${stats.answered} questions answered all-time`
            : "No questions answered yet — start a session!"}
        </div>

        <div className="grid-stats">
          <div className="kpi">
            <div className="v accent">{stats.answered}</div>
            <div className="l">Answered</div>
          </div>
          <div className="kpi">
            <div className="v good">{acc}%</div>
            <div className="l">Accuracy</div>
          </div>
          <div className="kpi">
            <div className="v warn">{stats.bestStreak}</div>
            <div className="l">Best streak</div>
          </div>
          <div className="kpi">
            <div className="v">{mastered}</div>
            <div className="l">Mastered</div>
          </div>
        </div>

        <div className="stat-block">
          <h4>Mastery (Leitner boxes)</h4>
          <div className="mastery-boxes">
            {boxCounts.map((c, i) => (
              <div key={i} className="mbox" style={{ borderColor: BOX_COLORS[i] + "55" }}>
                <div className="v" style={{ color: BOX_COLORS[i] }}>
                  {c}
                </div>
                <div className="l">Box {i + 1}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="stat-block">
          <h4>Response time trend (recent answers)</h4>
          <Sparkline id="stats-spark" values={history.slice(-40).map((h) => h.ms)} />
        </div>

        <div className="stat-block">
          <h4>Streak history</h4>
          <Sparkline id="stats-streak" values={stats.streakHistory.slice(-60)} />
        </div>

        <div className="stat-block">
          <h4>Accuracy by region</h4>
          {regKeys.length ? (
            regKeys.map((r) => {
              const pct = Math.round((reg[r].c / reg[r].a) * 100);
              return (
                <div className="bar-row" key={r}>
                  <span>{r}</span>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: pct + "%" }} />
                  </div>
                  <span className="num">{pct}%</span>
                </div>
              );
            })
          ) : (
            <div className="empty-note">No data yet.</div>
          )}
        </div>

        <div className="stat-block">
          <h4>Weakest items</h4>
          <div className="weak-list">
            {weak.length ? (
              weak.map(([id, n]) => {
                const c = DataLayer.byCcn3.get(id) || DataLayer.byCca3.get(id);
                if (!c) return null;
                return (
                  <div className="weak-item" key={id}>
                    <img
                      className="flag"
                      src={c.flagSvg}
                      alt=""
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
                      }}
                    />
                    <span className="nm">{c.name}</span>
                    <span className="miss">
                      {n} miss{n > 1 ? "es" : ""}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="empty-note">No misses recorded — nice!</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
