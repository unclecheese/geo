"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MODES, Logic } from "@geobean/core";
import { DataLayer } from "@/lib/data-layer";
import { useAtlasStore } from "@/store/atlas-store";
import { useQuizStore } from "@/store/quiz-store";
import { useData } from "@/components/DataProvider";
import { Autocomplete } from "@/components/Autocomplete";
import { Choices } from "@/components/Choices";
import { Reveal } from "@/components/Reveal";
import { Scorebar } from "@/components/Scorebar";
import { Results } from "@/components/Results";
import { StatsDashboard } from "@/components/StatsDashboard";

export default function QuizPage() {
  const router = useRouter();
  const { ready } = useData();

  const session = useQuizStore((s) => s.session);
  const current = useQuizStore((s) => s.current);
  const answered = useQuizStore((s) => s.answered);
  const reveal = useQuizStore((s) => s.reveal);
  const finished = useQuizStore((s) => s.finished);
  const choiceResult = useQuizStore((s) => s.choiceResult);
  const choices = useQuizStore((s) => s.choices);

  const start = useQuizStore((s) => s.start);
  const next = useQuizStore((s) => s.next);
  const handleTyped = useQuizStore((s) => s.handleTyped);
  const handleChoice = useQuizStore((s) => s.handleChoice);
  const quit = useQuizStore((s) => s.quit);

  const settings = useAtlasStore((s) => s.settings);

  const [showStats, setShowStats] = useState(false);

  // Start once data is ready and the store isn't already running/finished.
  useEffect(() => {
    if (!ready) return;
    const st = useQuizStore.getState();
    if (!st.active && !st.finished) start();
    return () => useQuizStore.getState().quit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Enter advances once the answer's been graded — even with the answer input
  // still focused. (The submitting Enter is safe: `answered` is still false on
  // that keystroke, so it grades without also skipping ahead.)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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

  const progressText = session ? `${session.asked} / ${session.total}` : "";
  const progressPct =
    session && session.total ? `${Math.round((session.asked / session.total) * 100)}%` : "0%";

  const item = current?.item;
  const mode = current?.mode;
  const difficult = settings.quizDifficulty === "difficult";

  // Autocomplete candidates from the active pool (difficult mode only).
  const activePool = Logic.filterPool(DataLayer.countries, settings.regions);
  const capitalCandidates = [
    ...new Set(
      activePool.filter((c) => c.capital && c.capital !== "—").map((c) => c.capital as string)
    ),
  ];
  const nameCandidates = [...new Set(activePool.map((c) => c.name))];

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
      </div>

      <div className="quiz-stage">
        <div className="q-top">
          <span className="q-mode">{mode ? MODES[mode].label : "—"}</span>
          <span className="q-progress">{progressText}</span>
        </div>
        <div className="q-bar" aria-hidden>
          <div className="q-bar-fill" style={{ width: progressPct }} />
        </div>

        {item && mode === "capital" && (
          <>
            <div>
              <div className="q-prompt">
                What is the capital of <span className="em">{item.name}</span>?
              </div>
              <div className="q-sub">{difficult ? "Type the city name" : "Pick the capital"}</div>
            </div>
            {difficult ? (
              <Autocomplete
                key={item.id + ":capital"}
                candidates={capitalCandidates}
                onSubmit={handleTyped}
              />
            ) : (
              <Choices
                choices={choices}
                answered={answered}
                choiceResult={choiceResult}
                label={(c) => c.capital || "—"}
                onPick={handleChoice}
              />
            )}
          </>
        )}

        {item && mode === "flag" && (
          <>
            <FlagPrompt key={item.id + ":flag"} src={item.flagSvg || ""} difficult={difficult} />
            {difficult ? (
              <Autocomplete
                key={item.id + ":flag-ac"}
                candidates={nameCandidates}
                onSubmit={handleTyped}
              />
            ) : (
              <Choices
                choices={choices}
                answered={answered}
                choiceResult={choiceResult}
                label={(c) => c.name}
                onPick={handleChoice}
              />
            )}
          </>
        )}

      </div>

      <Scorebar />
      <Reveal reveal={answered ? reveal : null} onNext={next} />
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

// Flag image with the same onError → placeholder swap as the single-file app.
function FlagPrompt({ src, difficult }: { src: string; difficult: boolean }) {
  const [failed, setFailed] = useState(false);
  return (
    <div>
      {failed ? (
        <div className="rv-flag-ph" style={{ width: 180, height: 120, margin: "0 auto 12px" }}>
          🏳
        </div>
      ) : (
        <img className="eq-flag" alt="flag" src={src} onError={() => setFailed(true)} />
      )}
      <div className="q-prompt" style={{ textAlign: "center" }}>
        Which country&apos;s flag is this?
      </div>
      <div className="q-sub" style={{ textAlign: "center" }}>
        {difficult ? "Type the country name" : "Pick the country"}
      </div>
    </div>
  );
}
