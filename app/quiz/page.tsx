"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MODES } from "@/lib/modes";
import { DataLayer } from "@/lib/data-layer";
import { Logic } from "@/lib/logic";
import { useAtlasStore } from "@/store/atlas-store";
import { useQuizStore } from "@/store/quiz-store";
import { useData } from "@/components/DataProvider";
import { Autocomplete } from "@/components/Autocomplete";
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

  const start = useQuizStore((s) => s.start);
  const next = useQuizStore((s) => s.next);
  const handleTyped = useQuizStore((s) => s.handleTyped);
  const quit = useQuizStore((s) => s.quit);

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

  const item = current?.item;
  const mode = current?.mode;

  // Autocomplete candidates from the active pool.
  const s = useAtlasStore.getState().settings;
  const activePool = Logic.filterPool(DataLayer.countries, s.region, s.subregion);
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

        {item && mode === "capital" && (
          <>
            <div>
              <div className="q-prompt">
                What is the capital of <span className="em">{item.name}</span>?
              </div>
              <div className="q-sub">Type the city name</div>
            </div>
            <Autocomplete
              key={item.id + ":capital"}
              candidates={capitalCandidates}
              onSubmit={handleTyped}
            />
          </>
        )}

        {item && mode === "flag" && (
          <>
            <FlagPrompt key={item.id + ":flag"} src={item.flagSvg || ""} />
            <Autocomplete
              key={item.id + ":flag-ac"}
              candidates={nameCandidates}
              onSubmit={handleTyped}
            />
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
function FlagPrompt({ src }: { src: string }) {
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
        Type the country name
      </div>
    </div>
  );
}
