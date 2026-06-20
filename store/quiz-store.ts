import { create } from "zustand";
import { Logic } from "@/lib/logic";
import { MODES } from "@/lib/modes";
import { DataLayer } from "@/lib/data-layer";
import { Audio2, Confetti } from "@/lib/fx";
import { useAtlasStore } from "@/store/atlas-store";
import { toast } from "@/store/toast-store";
import type { Country, ModeId } from "@/lib/types";

// Expert-only this phase. Map (find/name) and build land in later phases.
const EXPERT_MODES: ModeId[] = ["capital", "flag", "border"];

export interface QuizSession {
  type: string; // "round" | "endless"
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

// Post-submit border paint state for one question.
export interface BorderState {
  required: Set<string>;
  candidates: Country[];
  // null until submitted, then the grading breakdown for painting.
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

interface QuizState {
  active: boolean;
  session: QuizSession | null;
  current: CurrentQuestion | null;
  answered: boolean;
  borderState: BorderState | null;
  reveal: RevealState | null;
  finished: boolean; // true once a round completes -> show results
  qStartTime: number;
  elapsedMs: number; // mirrors session.elapsedMs for the timer display
  _timerId: ReturnType<typeof setInterval> | null;

  start: () => void;
  next: () => void;
  handleTyped: (value: string) => void;
  submitBorderExpert: (ids: string[]) => void;
  grade: (correct: boolean, extra?: { missing?: string[]; wrong?: string[] }) => void;
  finish: () => void;
  quit: () => void;
}

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const expertActiveModes = (): ModeId[] => {
  const m = useAtlasStore.getState().settings.modes.filter((id) => EXPERT_MODES.includes(id));
  return m.length ? m : ["capital"];
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
  finished: false,
  qStartTime: 0,
  elapsedMs: 0,
  _timerId: null,

  start: () => {
    const atlas = useAtlasStore.getState();
    const s = atlas.settings;
    const modes = Logic.sanitizeModes(s.modes).filter((id) => EXPERT_MODES.includes(id));
    const finalModes = modes.length ? modes : ["capital" as ModeId];
    // keep settings coherent if a stray non-expert mode slipped in
    if (finalModes.join() !== s.modes.join()) atlas.setSettings({ modes: finalModes });

    if (pool().length < 4) {
      toast("Pick a broader region — need at least 4 countries.", "bad");
      return;
    }

    const t = get()._timerId;
    if (t) clearInterval(t);

    const session: QuizSession = {
      type: s.session,
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

    if (session.asked >= session.total) {
      get().finish();
      return;
    }

    const modes = expertActiveModes();
    const p = pool();
    const leit = useAtlasStore.getState().leitner;
    const avoidId = state.current?.item.id;
    const exclude = session.askedIds;

    // Try each randomly-ordered mode until one yields an item; mirrors the
    // single-file _retryDifferentMode fallback without recursion.
    const order = Logic._shuffle([...modes]);
    let item: Country | null = null;
    let mode: ModeId | null = null;
    for (const m of order) {
      let cand: Country[] = [];
      if (m === "capital") cand = p.filter((c) => c.capital && c.capital !== "—");
      else if (m === "flag") cand = p.filter((c) => c.cca2);
      else if (m === "border") cand = p.filter((c) => c.neighbours.some((n) => p.includes(n)));
      if (!cand.length) continue;
      const picked = Logic.selectNextItem(cand, leit, m, { avoidId, exclude });
      if (picked) {
        item = picked;
        mode = m;
        break;
      }
    }
    if (!item || !mode) {
      get().finish();
      return;
    }

    session.askedIds.add(item.id);
    session.asked += 1;

    let borderState: BorderState | null = null;
    if (mode === "border") borderState = buildBorderState(item, p);

    set({
      current: { item, mode },
      answered: false,
      reveal: null,
      borderState,
      qStartTime: now(),
      session: { ...session },
    });
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
    set({
      borderState: { ...bs, submitted: { selected: sel, missing, wrong } },
    });
    get().grade(correct, { missing, wrong });
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

    // Persist outcome: leitner + history + stats (+ streak history) in one call,
    // and lift bestStreak into the durable stats.
    const atlas = useAtlasStore.getState();
    atlas.recordVerdict({ id: item.id, mode, correct, ms, region: item.region, streak: session.streak });
    atlas.recordBestStreak(session.bestStreak);

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
    set({
      active: false,
      finished: false,
      session: null,
      current: null,
      reveal: null,
      answered: false,
      borderState: null,
      _timerId: null,
    });
  },
}));

// Border (expert) candidate set: real neighbours in-pool plus same-region-biased
// distractors to roughly double the option count. Ported from _buildBorderState.
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
