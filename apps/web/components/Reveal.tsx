"use client";

import { useState } from "react";
import { DataLayer } from "@geobean/core";
import type { RevealState } from "@/store/quiz-store";

interface RevealProps {
  reveal: RevealState | null;
  onNext: () => void;
}

// Feedback card shown after grading: flag, name, capital · subregion, verdict,
// and meta (region, border count, time, plus missed/wrong for border mode).
// Ported from UI.showReveal.
export function Reveal({ reveal, onNext }: RevealProps) {
  const [flagFailed, setFlagFailed] = useState(false);

  // reset the flag fallback whenever the item changes
  const itemId = reveal?.item.id;
  const [seenId, setSeenId] = useState<string | undefined>(itemId);
  if (itemId !== seenId) {
    setSeenId(itemId);
    setFlagFailed(false);
  }

  const show = !!reveal;
  const item = reveal?.item;
  const meta: string[] = [];
  if (reveal && item) {
    meta.push("Region: " + item.region);
    if (item.neighbours.length) meta.push("Borders: " + item.neighbours.length);
    meta.push("Time: " + (reveal.ms / 1000).toFixed(1) + "s");
    if (reveal.mode === "border") {
      if (reveal.missing && reveal.missing.length)
        meta.push(
          "Missed: " + reveal.missing.map((id) => DataLayer.byCcn3.get(id)?.name || id).join(", ")
        );
      if (reveal.wrong && reveal.wrong.length)
        meta.push(
          "Wrong: " + reveal.wrong.map((id) => DataLayer.byCcn3.get(id)?.name || id).join(", ")
        );
    }
  }

  const cls = "" + (show ? " show" : "") + (reveal ? (reveal.correct ? " good" : " bad") : "");

  return (
    <div id="reveal" className={cls.trim()}>
      <div className="rv-head">
        {item && !flagFailed ? (
          <img className="rv-flag" src={item.flagSvg} alt="" onError={() => setFlagFailed(true)} />
        ) : (
          <div className="rv-flag-ph">🏳</div>
        )}
        <div>
          <div className="rv-name">{item?.name}</div>
          <div className="rv-cap">{item ? "Capital: " + item.capital + " · " + item.subregion : ""}</div>
        </div>
        <div className={"rv-verdict " + (reveal?.correct ? "good" : "bad")}>
          {reveal?.correct ? "✓ Correct" : "✕ Missed"}
        </div>
      </div>
      <div className="rv-meta">
        {meta.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <button className="btn rv-next" onClick={onNext}>
        Next ▸
      </button>
    </div>
  );
}
