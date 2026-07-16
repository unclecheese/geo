"use client";

import { Logic, useAtlasStore, useQuizStore } from "@geobean/core";

// Floating score / accuracy / streak / time pills. Score & streak come from the
// live session; accuracy is all-time from persisted stats. Ported from
// UI.updateScorebar + #scorebar markup.
export function Scorebar() {
  const session = useQuizStore((s) => s.session);
  const elapsedMs = useQuizStore((s) => s.elapsedMs);
  const stats = useAtlasStore((s) => s.stats);

  const visible = !!session;
  const acc = stats.answered ? Math.round((stats.correct / stats.answered) * 100) + "%" : "—";
  const cls = "" + (visible ? " visible" : "") + (session?.timed ? " timed" : "");

  return (
    <div id="scorebar" className={cls.trim()}>
      <div className="stat-pill">
        <span className="v">{session?.score ?? 0}</span>
        <span className="l">Score</span>
      </div>
      <div className="stat-pill acc">
        <span className="v">{acc}</span>
        <span className="l">Acc</span>
      </div>
      <div className="stat-pill streak">
        <span className="v">🔥 {session?.streak ?? 0}</span>
      </div>
      <div className="stat-pill" id="timer-ring">
        <span className="v">{Logic.fmtDuration(elapsedMs)}</span>
      </div>
    </div>
  );
}
