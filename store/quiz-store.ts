import { create } from "zustand";
import { Logic } from "@/lib/logic";
import { MODES } from "@/lib/modes";
import { DataLayer } from "@/lib/data-layer";
import { Audio2, Confetti } from "@/lib/fx";
import { useAtlasStore } from "@/store/atlas-store";
import { toast } from "@/store/toast-store";
import type { Country, ModeId, ModeGroup } from "@/lib/types";

// Modes that belong to each screen.
const MAP_MODES: ModeId[] = ["find", "name"];
const EXPERT_MODES: ModeId[] = ["capital", "flag", "border"];
const NON_BUILD_MODES: ModeId[] = [...MAP_MODES, ...EXPERT_MODES];

function screenFor(modes: ModeId[]): "map" | "quiz" {
  return modes.length > 0 && modes.every((m) => MODES[m]?.group === ("map" as ModeGroup))
    ? "map"
    : "quiz";
}

export interface QuizSession {
  type: string; // "round" | "endless"
  screen: "map" | "quiz";
  total: number; // Infinity for endless
  timed: boolean;
  asked: number;
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  askedIds: Set<string>;
  startTime: number;
  elapsedMs: number;
}

export interface CurrentQuestion {
  item: Country;
  mode: ModeId;
}

export interface BorderState {
  required: Set<string>;
  candidates: Country[];
  submitted: {
    selected: Set<string>;
    missing: string[];
    wrong: string[];
  } | null;
}

export interface RevealState {
  item: Country;
  correct: boolean;
  ms: number;
  mode: ModeId;
  missing?: string[];
  wrong?: string[];
}

// Choice state for name-mode MC — which button was picked (for visual marking).
export interface ChoiceResult {
  pickedId: string;
  correctId: string;
}

interface QuizState {
  active: boolean;
  session: QuizSession | null;
  current: CurrentQuestion | null;
  answered: boolean;
  borderState: BorderState | null;
  reveal: RevealState | null;
  choiceResult: ChoiceResult | null;
  finished: boolean;
  qStartTime: number;
  elapsedMs: number;
  _timerId: ReturnType<typeof setInterval> | null;

  start: () => void;
  next: () => void;
  handleTyped: (value: string) => void;
  submitBorderExpert: (ids: string[]) => void;
  handleMapSelect: (country: Country) => void;
  handleChoice: (chosen: Country) => void;
  grade: (correct: boolean, extra?: { missing?: string[]; wrong?: string[] }) => void;
  finish: () => void;
  quit: () => void;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const activeModes = (): ModeId[] => {
  const raw = useAtlasStore.getState().settings.modes;
  const sanitized = Logic.sanitizeModes(raw);
  // exclude build — build has its own page
  const filtered = sanitized.filter((id) => NON_BUILD_MODES.includes(id));
  return filtered.length ? filtered : ["capital" as ModeId];
};

const pool = (): Country[] => {
  const s = useAtlasStore.getState().settings;
  return Logic.filterPool(DataLayer.countries, s.region, s.subregion);
};

const PRAISE = ["Nailed it!", "Correct!", "Spot on!", "Yes!", "Geography wizard ✨", "Bang on."];
const praise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];

export const useQuizStore = create<QuizState>((set, get) => ({
  active: false,
  session: null,
  current: null,
  answered: false,
  borderState: null,
  reveal: null,
  choiceResult: null,
  finished: false,
  qStartTime: 0,
  elapsedMs: 0,
  _timerId: null,

  start: () => {
    const atlas = useAtlasStore.getState();
    const s = atlas.settings;
    const modes = activeModes();
    const screen = screenFor(modes);

    // bail if build ended up here somehow
    if (MODES[modes[0]]?.group === "build") return;

    if (pool().length < 4) {
      toast("Pick a broader region — need at least 4 countries.", "bad");
      return;
    }

    const t = get()._timerId;
    if (t) clearInterval(t);

    const session: QuizSession = {
      type: s.session,
      screen,
      total: s.session === "round" ? s.roundLen : Infinity,
      timed: s.timed,
      asked: 0,
      score: 0,
      streak: 0,
      bestStreak: 0,
      correct: 0,
      askedIds: new Set<string>(),
      startTime: now(),
      elapsedMs: 0,
    };
    set({
      active: true,
      finished: false,
      session,
      current: null,
      answered: false,
      borderState: null,
      reveal: null,
      choiceResult: null,
      elapsedMs: 0,
    });

    // session stopwatch
    const tick = () => {
      const st = get().session;
      if (!st) return;
      const elapsed = now() - st.startTime;
      st.elapsedMs = elapsed;
      set({ elapsedMs: elapsed });
    };
    tick();
    const id = setInterval(tick, 500);
    set({ _timerId: id });

    get().next();
  },

  next: () => {
    const state = get();
    if (!state.active || !state.session) return;
    const session = state.session;

    // Clear map highlights at the start of each question in map mode.
    if (session.screen === "map") {
      // Import is deferred to avoid a circular dep at module load time.
      import("@/lib/map-view").then(({ MapView }) => {
        if (MapView._inited) MapView.clearHighlights();
      });
    }

    if (session.asked >= session.total) {
      get().finish();
      return;
    }

    const modes = activeModes();
    // Pick a random mode from the active set (mirrors original random pick).
    const mode = modes[Math.floor(Math.random() * modes.length)];
    const p = pool();
    const leit = useAtlasStore.getState().leitner;
    const avoidId = state.current?.item.id;
    const exclude = session.askedIds;

    // Try the picked mode; fall back through the others if candidates are empty.
    const order = [mode, ...Logic._shuffle(modes.filter((m) => m !== mode))];
    let item: Country | null = null;
    let chosenMode: ModeId | null = null;

    for (const m of order) {
      let cand: Country[] = [];
      if (m === "find" || m === "name") {
        cand = Logic.mapPool(p);
      } else if (m === "capital") {
        cand = p.filter((c) => c.capital && c.capital !== "—");
      } else if (m === "flag") {
        cand = p.filter((c) => c.cca2);
      } else if (m === "border") {
        cand = p.filter((c) => c.neighbours.some((n) => p.includes(n)));
      }
      if (!cand.length) continue;
      const picked = Logic.selectNextItem(cand, leit, m, { avoidId, exclude });
      if (picked) {
        item = picked;
        chosenMode = m;
        break;
      }
    }

    if (!item || !chosenMode) {
      get().finish();
      return;
    }

    session.askedIds.add(item.id);
    session.asked += 1;

    let borderState: BorderState | null = null;
    if (chosenMode === "border") borderState = buildBorderState(item, p);

    set({
      current: { item, mode: chosenMode },
      answered: false,
      reveal: null,
      choiceResult: null,
      borderState,
      qStartTime: now(),
      session: { ...session },
    });

    // Map framing for tiny countries (deferred import to avoid circular dep).
    if (chosenMode === "find" || chosenMode === "name") {
      import("@/lib/map-view").then(({ MapView }) => {
        if (!MapView._inited) return;
        if (MapView.tinyIds.has(item!.id)) MapView.frameCountry(item!, 0.5);
        if (chosenMode === "name") MapView.paint(item!.id, "target");
      });
    }
  },

  handleTyped: (value: string) => {
    const state = get();
    if (!state.active || state.answered || !state.current) return;
    const { item, mode } = state.current;
    const answer = mode === "capital" ? item.capital : item.name;
    get().grade(Logic.matchAnswer(value, answer || ""));
  },

  submitBorderExpert: (ids: string[]) => {
    const state = get();
    if (!state.active || state.answered || !state.current || state.current.mode !== "border") return;
    const bs = state.borderState;
    if (!bs) return;
    const sel = new Set(ids);
    const missing = [...bs.required].filter((id) => !sel.has(id));
    const wrong = [...sel].filter((id) => !bs.required.has(id));
    const correct = missing.length === 0 && wrong.length === 0;
    set({ borderState: { ...bs, submitted: { selected: sel, missing, wrong } } });
    get().grade(correct, { missing, wrong });
  },

  handleMapSelect: (country: Country) => {
    const state = get();
    // Not an active unanswered map question → show quick info only.
    if (!state.active || state.answered || !state.current) {
      import("@/lib/map-view").then(({ MapView }) => {
        if (MapView._inited) MapView.flashSelect(country.id);
      });
      toast(`${country.name} — capital ${country.capital}`);
      return;
    }
    const { mode, item } = state.current;
    if (MODES[mode]?.group !== "map") {
      // Wrong screen/mode — treat as quick-info.
      import("@/lib/map-view").then(({ MapView }) => {
        if (MapView._inited) MapView.flashSelect(country.id);
      });
      toast(`${country.name} — capital ${country.capital}`);
      return;
    }
    if (mode === "find") {
      const correct = country.id === item.id;
      import("@/lib/map-view").then(({ MapView }) => {
        if (!MapView._inited) return;
        MapView.paint(country.id, correct ? "good" : "bad");
        if (!correct) MapView.paint(item.id, "target");
      });
      get().grade(correct);
    }
    // "name" is answered via MC choices, not map clicks.
  },

  handleChoice: (chosen: Country) => {
    const state = get();
    if (!state.active || state.answered || !state.current) return;
    const { item, mode } = state.current;
    if (mode !== "name") return;
    const correct = chosen.id === item.id;
    set({ choiceResult: { pickedId: chosen.id, correctId: item.id } });
    import("@/lib/map-view").then(({ MapView }) => {
      if (MapView._inited) MapView.paint(item.id, correct ? "good" : "target");
    });
    get().grade(correct);
  },

  grade: (correct, extra = {}) => {
    const state = get();
    if (state.answered || !state.current || !state.session) return;
    const ms = Math.round(now() - state.qStartTime);
    const { item, mode } = state.current;
    const session = { ...state.session };

    if (correct) {
      session.correct += 1;
      session.streak += 1;
      let pts = 100;
      pts += Math.min(60, session.streak * 6);
      session.score += pts;
      session.bestStreak = Math.max(session.bestStreak, session.streak);
      Audio2.correct();
      toast(praise(), "good");
      if (session.streak > 0 && session.streak % 5 === 0) {
        Confetti.burst();
        Audio2.milestone();
        toast("🔥 " + session.streak + " in a row!", "good");
      }
    } else {
      session.streak = 0;
      Audio2.wrong();
      toast("Not quite — it's " + item.name, "bad");
    }

    const atlas = useAtlasStore.getState();
    atlas.recordVerdict({ id: item.id, mode, correct, ms, region: item.region, streak: session.streak });
    atlas.recordBestStreak(session.bestStreak);

    // Refresh heatmap on map screen if it's on.
    if (session.screen === "map" && atlas.settings.heatmap) {
      import("@/lib/map-view").then(({ MapView }) => {
        if (MapView._inited) MapView.refreshColors();
      });
    }

    set({
      answered: true,
      session,
      reveal: {
        item,
        correct,
        ms,
        mode,
        missing: extra.missing,
        wrong: extra.wrong,
      },
    });
  },

  finish: () => {
    const state = get();
    const t = state._timerId;
    if (t) clearInterval(t);
    const session = state.session ? { ...state.session } : null;
    if (session) session.elapsedMs = session.startTime ? now() - session.startTime : session.elapsedMs;

    // Clear map on finish.
    if (session?.screen === "map") {
      import("@/lib/map-view").then(({ MapView }) => {
        if (MapView._inited) {
          MapView.clearHighlights();
          MapView.reset();
        }
      });
    }

    if (session && session.type === "round") {
      Confetti.burst();
      set({ active: false, finished: true, session, current: null, reveal: null, _timerId: null });
    } else {
      if (session) toast("Endless session ended in " + Logic.fmtDuration(session.elapsedMs), "good");
      set({ active: false, finished: false, session: null, current: null, reveal: null, _timerId: null });
    }
  },

  quit: () => {
    const t = get()._timerId;
    if (t) clearInterval(t);
    // Clear map highlights on quit.
    const session = get().session;
    if (session?.screen === "map") {
      import("@/lib/map-view").then(({ MapView }) => {
        if (MapView._inited) MapView.clearHighlights();
      });
    }
    set({
      active: false,
      finished: false,
      session: null,
      current: null,
      reveal: null,
      answered: false,
      borderState: null,
      choiceResult: null,
      _timerId: null,
    });
  },
}));

// Border candidate set (unchanged from Phase 3).
function buildBorderState(item: Country, p: Country[]): BorderState {
  const reqObjs = item.neighbours.filter((n) => p.includes(n));
  const required = new Set(reqObjs.map((n) => n.id));
  const nonNeighbours = p.filter((c) => c.id !== item.id && !required.has(c.id));
  const sameR = Logic._shuffle(nonNeighbours.filter((c) => c.region === item.region));
  const otherR = Logic._shuffle(nonNeighbours.filter((c) => c.region !== item.region));
  const total = Math.max(8, required.size * 2);
  const distractors: Country[] = [];
  while (distractors.length < total - required.size && sameR.length) distractors.push(sameR.pop()!);
  while (distractors.length < total - required.size && otherR.length) distractors.push(otherR.pop()!);
  return {
    required,
    candidates: Logic._shuffle(reqObjs.concat(distractors)),
    submitted: null,
  };
}
