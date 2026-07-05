import { create } from "zustand";
import { Logic } from "@/lib/logic";
import { DataLayer } from "@/lib/data-layer";
import { Audio2, Confetti } from "@/lib/fx";
import { useAtlasStore } from "@/store/atlas-store";
import { toast } from "@/store/toast-store";
import type { Country } from "@/lib/types";
import type { QuizSession } from "@/store/quiz-store";

// "Borders" quiz: a target country is shown in a static framed picture with its
// land neighbours numbered around it (see components/FrameView). The player
// identifies each numbered neighbour — matching names to numbers (easy) or typing
// each (difficult) — then submits the whole question at once. No live map, so this
// store holds no d3/MapView; it is a plain state machine over the framed picture.

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

const SHOW_MAX = 6;

// A neighbour is numberable only if it has geometry/marker to render.
const drawable = (c: Country): boolean => !!(c.feature || c.centroid);
const neighboursOf = (c: Country): Country[] => c.neighbours.filter(drawable);

const pool = (): Country[] => {
  const s = useAtlasStore.getState().settings;
  return Logic.filterPool(DataLayer.countries, s.regions, s.subregions);
};

// Targets: framable countries in the active pool with ≥1 drawable neighbour.
const targetPool = (): Country[] =>
  pool().filter((c) => c.feature && neighboursOf(c).length > 0);

export interface BordersResult {
  country: Country; // a numbered neighbour
  num: number; // its 1-based badge number
  ok: boolean;
}

export interface BordersReveal {
  target: Country;
  correct: boolean;
  ms: number;
  results: BordersResult[];
}

interface BordersState {
  active: boolean;
  session: QuizSession | null;
  finished: boolean;
  target: Country | null;
  shown: Country[]; // numbered neighbours; shown[i] carries badge number i+1
  candidates: Country[]; // easy: names to match (shown + distractors), shuffled; [] when difficult
  easy: boolean; // difficulty snapshot for this question
  assign: Record<string, number | null>; // easy: candidate.id -> chosen badge number, or null
  typed: Record<number, string>; // difficult: badge number -> typed value
  answered: boolean;
  reveal: BordersReveal | null;
  qStartTime: number;
  elapsedMs: number;
  _timerId: ReturnType<typeof setInterval> | null;

  start: () => void;
  next: () => void;
  setAssign: (candidateId: string, num: number | null) => void;
  setTyped: (num: number, value: string) => void;
  submit: () => void;
  quit: () => void;
}

export const useBordersStore = create<BordersState>((set, get) => ({
  active: false,
  session: null,
  finished: false,
  target: null,
  shown: [],
  candidates: [],
  easy: true,
  assign: {},
  typed: {},
  answered: false,
  reveal: null,
  qStartTime: 0,
  elapsedMs: 0,
  _timerId: null,

  start: () => {
    const s = useAtlasStore.getState().settings;
    const targets = targetPool();
    if (!targets.length) {
      toast("No countries with land borders in this selection — pick a broader region.", "bad");
      return;
    }
    const t = get()._timerId;
    if (t) clearInterval(t);

    const session: QuizSession = {
      type: s.session,
      screen: "quiz",
      total: s.session === "round" ? s.roundLen : targets.length,
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
      target: null,
      shown: [],
      candidates: [],
      assign: {},
      typed: {},
      answered: false,
      reveal: null,
      elapsedMs: 0,
    });

    const tick = () => {
      const st = get().session;
      if (!st) return;
      st.elapsedMs = now() - st.startTime;
      set({ elapsedMs: st.elapsedMs });
    };
    tick();
    set({ _timerId: setInterval(tick, 500) });

    get().next();
  },

  next: () => {
    const state = get();
    if (!state.active || !state.session) return;
    const session = state.session;

    if (session.asked >= session.total) {
      const t = state._timerId;
      if (t) clearInterval(t);
      session.elapsedMs = session.startTime ? now() - session.startTime : session.elapsedMs;
      Confetti.burst();
      set({ active: false, finished: true, session: { ...session }, target: null, reveal: null, _timerId: null });
      return;
    }

    const leit = useAtlasStore.getState().leitner;
    const picked = Logic.selectNextItem(targetPool(), leit, "border", {
      avoidId: state.target?.id,
      exclude: session.askedIds,
    });
    if (!picked) {
      set({ session: { ...session, total: session.asked } });
      get().next();
      return;
    }

    session.askedIds.add(picked.id);
    session.asked += 1;

    const shown = Logic.pickShown(neighboursOf(picked), SHOW_MAX);
    const easy = useAtlasStore.getState().settings.quizDifficulty === "easy";

    // Easy mode: pad the candidate list up to SHOW_MAX with nearby non-neighbour
    // distractors (makeChoices ranks by proximity/region), then shuffle. When the
    // shown neighbours already fill the list there are no distractors.
    let candidates: Country[] = [];
    if (easy) {
      const excluded = new Set([picked.id, ...picked.neighbours.map((n) => n.id)]);
      const base = DataLayer.countries.filter((c) => !excluded.has(c.id));
      const want = Math.max(0, SHOW_MAX - shown.length);
      const distractors = want
        ? Logic.makeChoices(picked, base, want + 1)
            .filter((c) => c.id !== picked.id)
            .slice(0, want)
        : [];
      candidates = Logic._shuffle(shown.concat(distractors));
    }

    set({
      target: picked,
      shown,
      candidates,
      easy,
      assign: {},
      typed: {},
      answered: false,
      reveal: null,
      qStartTime: now(),
      session: { ...session },
    });
  },

  setAssign: (candidateId, num) => {
    const state = get();
    if (!state.active || state.answered) return;
    // A badge number holds one candidate at a time — clear any prior holder.
    const assign: Record<string, number | null> = { ...state.assign };
    if (num !== null) {
      for (const id of Object.keys(assign)) if (assign[id] === num) assign[id] = null;
    }
    assign[candidateId] = num;
    set({ assign });
  },

  setTyped: (num, value) => {
    const state = get();
    if (!state.active || state.answered) return;
    set({ typed: { ...state.typed, [num]: value } });
  },

  submit: () => {
    const state = get();
    const { target, shown, session } = state;
    if (!state.active || state.answered || !target || !session) return;

    const results: BordersResult[] = shown.map((c, i) => {
      const num = i + 1;
      const ok = state.easy
        ? state.assign[c.id] === num
        : Logic.matchAnswer(state.typed[num] || "", c.name);
      return { country: c, num, ok };
    });
    // Easy mode also requires every distractor to be left unassigned.
    const distractorsClean = state.easy
      ? state.candidates.every((c) => shown.some((s) => s.id === c.id) || state.assign[c.id] == null)
      : true;
    const correct = results.every((r) => r.ok) && distractorsClean;

    const ms = Math.round(now() - state.qStartTime);
    const s = { ...session };
    if (correct) {
      s.correct += 1;
      s.streak += 1;
      s.score += 100 + Math.min(60, s.streak * 6);
      s.bestStreak = Math.max(s.bestStreak, s.streak);
      Audio2.correct();
      if (s.streak > 0 && s.streak % 5 === 0) {
        Confetti.burst();
        Audio2.milestone();
        toast("🔥 " + s.streak + " in a row!", "good");
      } else {
        toast(`All ${shown.length} neighbours of ${target.name}!`, "good");
      }
    } else {
      s.streak = 0;
      Audio2.wrong();
      const got = results.filter((r) => r.ok).length;
      toast(`${got} / ${shown.length} — that's ${target.name}.`, "bad");
    }

    const atlas = useAtlasStore.getState();
    atlas.recordVerdict({ id: target.id, mode: "border", correct, ms, region: target.region, streak: s.streak });
    atlas.recordBestStreak(s.bestStreak);

    set({
      answered: true,
      session: s,
      reveal: { target, correct, ms, results },
    });
  },

  quit: () => {
    const t = get()._timerId;
    if (t) clearInterval(t);
    set({
      active: false,
      finished: false,
      session: null,
      target: null,
      shown: [],
      candidates: [],
      assign: {},
      typed: {},
      answered: false,
      reveal: null,
      _timerId: null,
    });
  },
}));
