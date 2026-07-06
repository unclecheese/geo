"use client";

import { Logic } from "@geobean/core";
import { useAtlasStore } from "@/store/atlas-store";
import { useQuizStore } from "@/store/quiz-store";

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
        <div className="v">{session?.score ?? 0}</div>
        <div className="l">Score</div>
      </div>
      <div className="stat-pill">
        <div className="v">{acc}</div>
        <div className="l">Accuracy</div>
      </div>
      <div className="stat-pill streak">
        <div className="v">{session?.streak ?? 0}</div>
        <div className="l">Streak</div>
      </div>
      <div className="stat-pill" id="timer-ring">
        <div className="v">{Logic.fmtDuration(elapsedMs)}</div>
        <div className="l">Time</div>
      </div>
    </div>
  );
}
