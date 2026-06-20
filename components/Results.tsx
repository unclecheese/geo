"use client";

import { Logic } from "@/lib/logic";
import type { QuizSession } from "@/store/quiz-store";

interface ResultsProps {
  session: QuizSession | null; // non-null when the round-complete modal is open
  onAgain: () => void;
  onStats: () => void;
  onMenu: () => void;
}

// Round-complete modal. Ported from UI.showResults + #results-back markup.
export function Results({ session, onAgain, onStats, onMenu }: ResultsProps) {
  if (!session) return null;
  const acc = session.asked ? Math.round((session.correct / session.asked) * 100) : 0;
  const title = acc >= 80 ? "Brilliant round! 🎉" : acc >= 50 ? "Nice work! 👏" : "Keep practising! 💪";
  const sub =
    `${session.correct} of ${session.asked} correct` +
    (session.timed ? ` · ${Logic.fmtDuration(session.elapsedMs)}` : "");

  return (
    <div className="modal-back show" id="results-back">
      <div className="modal" style={{ position: "relative" }}>
        <button className="close-x" onClick={onMenu}>
          ×
        </button>
        <h2>{title}</h2>
        <div className="sub">{sub}</div>
        <div className="grid-stats">
          <div className="kpi">
            <div className="v accent">{session.score}</div>
            <div className="l">Score</div>
          </div>
          <div className="kpi">
            <div className="v good">{acc}%</div>
            <div className="l">Accuracy</div>
          </div>
          <div className="kpi">
            <div className="v warn">{session.bestStreak}</div>
            <div className="l">Best streak</div>
          </div>
          <div className="kpi">
            <div className="v">{session.asked}</div>
            <div className="l">Questions</div>
          </div>
          {session.timed && (
            <div className="kpi">
              <div className="v accent">{Logic.fmtDuration(session.elapsedMs)}</div>
              <div className="l">Time</div>
            </div>
          )}
        </div>
        <div className="split">
          <button className="btn" onClick={onAgain}>
            Play again
          </button>
          <button className="btn ghost" onClick={onStats}>
            Full stats
          </button>
          <button className="btn ghost" onClick={onMenu}>
            Menu
          </button>
        </div>
      </div>
    </div>
  );
}
