"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MODES, Logic } from "@geobean/core";
import { DataLayer } from "@/lib/data-layer";
import { useAtlasStore } from "@/store/atlas-store";
import { useBordersStore } from "@/store/borders-store";
import { useData } from "@/components/DataProvider";
import { FrameView } from "@/components/FrameView";
import { Scorebar } from "@/components/Scorebar";
import { Results } from "@/components/Results";
import { StatsDashboard } from "@/components/StatsDashboard";
import { Audio2 } from "@/lib/fx";

export default function BordersPage() {
  const router = useRouter();
  const { ready } = useData();

  const session = useBordersStore((s) => s.session);
  const target = useBordersStore((s) => s.target);
  const shown = useBordersStore((s) => s.shown);
  const candidates = useBordersStore((s) => s.candidates);
  const easy = useBordersStore((s) => s.easy);
  const assign = useBordersStore((s) => s.assign);
  const typed = useBordersStore((s) => s.typed);
  const answered = useBordersStore((s) => s.answered);
  const reveal = useBordersStore((s) => s.reveal);
  const finished = useBordersStore((s) => s.finished);

  const start = useBordersStore((s) => s.start);
  const next = useBordersStore((s) => s.next);
  const setAssign = useBordersStore((s) => s.setAssign);
  const setTyped = useBordersStore((s) => s.setTyped);
  const submit = useBordersStore((s) => s.submit);
  const quit = useBordersStore((s) => s.quit);

  const settings = useAtlasStore((s) => s.settings);
  const setSettings = useAtlasStore((s) => s.setSettings);

  const [showStats, setShowStats] = useState(false);

  // Start on mount once data is ready; redirect out if the saved mode isn't Borders.
  useEffect(() => {
    if (!ready) return;
    const modes = Logic.sanitizeModes(useAtlasStore.getState().settings.modes);
    if (MODES[modes[0]]?.group !== "borders") {
      router.replace("/");
      return;
    }
    const st = useBordersStore.getState();
    if (!st.active && !st.finished) start();
    return () => useBordersStore.getState().quit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Enter advances once the reveal card is showing (but not while typing a blank).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches?.("input")) return;
      if (e.key === "Enter" && answered && reveal) next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answered, reveal, next]);

  if (!ready) return null;

  const backToMenu = () => {
    quit();
    router.push("/", { scroll: false });
  };

  const toggleSound = () => {
    const on = !settings.sound;
    setSettings({ sound: on });
    if (on) {
      Audio2.ensure();
      Audio2.correct();
    }
  };

  const progressText = session ? `${session.asked} / ${session.total}` : "";
  const progressPct =
    session && session.total ? `${Math.round((session.asked / session.total) * 100)}%` : "0%";
  const nums = shown.map((_, i) => i + 1); // badge numbers 1..n

  // Naming candidates for difficult mode: any country (neighbours may sit outside
  // the active region filter).
  const allNames = [...new Set(DataLayer.countries.map((c) => c.name))];

  return (
    <section className="screen-quiz">
      <div className="screen-top">
        <div className="st-left">
          <button className="icon-btn" title="Back to menu" onClick={backToMenu}>
            ←
          </button>
          <div className="brand sm">
            <div className="logo" />
            <h1>GeoBean</h1>
          </div>
        </div>
        <div className="st-right">
          <button
            className={"icon-btn sound-btn" + (settings.sound ? " active" : "")}
            title={"Sound (" + (settings.sound ? "on" : "off") + ")"}
            onClick={toggleSound}
          >
            {settings.sound ? "🔊" : "🔇"}
          </button>
        </div>
      </div>

      <div className="quiz-stage">
        <div className="q-top">
          <span className="q-mode">Borders</span>
          <span className="q-progress">{progressText}</span>
        </div>
        <div className="q-bar" aria-hidden>
          <div className="q-bar-fill" style={{ width: progressPct }} />
        </div>

        {target && (
          <>
            <div className="q-prompt" style={{ textAlign: "center" }}>
              Name the countries bordering <span className="em">{target.name}</span>
            </div>
            <div className="q-sub" style={{ textAlign: "center" }}>
              {easy
                ? "Tap each name, then its number in the picture. Some don't border it — leave those unset."
                : "Type the country at each number"}
            </div>

            <FrameView key={target.id} target={target} shown={shown} />

            {/* Easy: match candidate names to badge numbers. */}
            {easy && !answered && (
              <div className="bd-match">
                {candidates.map((c) => (
                  <div className="bd-row" key={c.id}>
                    <span className="bd-cand">{c.name}</span>
                    <div className="bd-nums">
                      {nums.map((num) => (
                        <button
                          key={num}
                          className={assign[c.id] === num ? "on" : ""}
                          onClick={() => setAssign(c.id, assign[c.id] === num ? null : num)}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <button className="btn bd-submit" onClick={submit}>
                  Submit ▸
                </button>
              </div>
            )}

            {/* Difficult: one controlled input per badge number. */}
            {!easy && !answered && (
              <div className="bd-blanks">
                {nums.map((num) => (
                  <div className="bd-blank" key={num}>
                    <span className="bd-num">{num}</span>
                    <BlankInput
                      value={typed[num] || ""}
                      candidates={allNames}
                      onChange={(v) => setTyped(num, v)}
                    />
                  </div>
                ))}
                <button className="btn bd-submit" onClick={submit}>
                  Submit ▸
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Scorebar />

      {/* Reveal: per-neighbour ✓/✗ with the correct names. */}
      {answered && reveal && (
        <div id="reveal" className={"show " + (reveal.correct ? "good" : "bad")}>
          <div className="rv-head">
            <img className="rv-flag" src={reveal.target.flagSvg} alt="" />
            <div>
              <div className="rv-name">{reveal.target.name}</div>
              <div className="rv-cap">
                {reveal.results.filter((r) => r.ok).length} of {reveal.results.length} correct
              </div>
            </div>
            <div className={"rv-verdict " + (reveal.correct ? "good" : "bad")}>
              {reveal.correct ? "✓ All correct" : `${reveal.results.filter((r) => r.ok).length} / ${reveal.results.length}`}
            </div>
          </div>
          <div className="rv-meta">
            {reveal.results.map((r) => (
              <span key={r.country.id} className={r.ok ? "bd-ok" : "bd-no"}>
                {r.ok ? "✓ " : "✗ "}
                {r.num}. {r.country.name}
              </span>
            ))}
          </div>
          <button className="btn rv-next" onClick={next}>
            Next ▸
          </button>
        </div>
      )}

      <Results
        session={finished ? session : null}
        onAgain={start}
        onStats={() => setShowStats(true)}
        onMenu={backToMenu}
      />
      <StatsDashboard open={showStats} onClose={() => setShowStats(false)} />
    </section>
  );
}

// A controlled name input with a lightweight suggestion dropdown, mirrored straight
// into store state (no per-blank Submit/Skip — one Submit grades the whole picture).
function BlankInput({
  value,
  candidates,
  onChange,
}: {
  value: string;
  candidates: string[];
  onChange: (v: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  // Drop a suggestion identical to what's typed: once a blank holds a complete
  // country name the dropdown closes, so it never overlays (and swallows a click
  // on) the Submit button below the last blank.
  const items = focused ? Logic.suggest(value, candidates, 6).filter((s) => s !== value) : [];
  return (
    <div className="ac" style={{ flex: 1 }}>
      <input
        className="ac-input"
        type="text"
        autoComplete="off"
        spellCheck={false}
        placeholder="Type a country…"
        value={value}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="ac-list" hidden={!items.length}>
        {items.map((c) => (
          <div
            key={c}
            className="ac-opt"
            onMouseDown={(e) => {
              e.preventDefault();
              onChange(c);
              setFocused(false);
            }}
          >
            {c}
          </div>
        ))}
      </div>
    </div>
  );
}
