import { create } from "zustand";
import { Logic } from "../logic";
import { MODES } from "../modes";
import { DataLayer } from "../data-layer";
import type { Country, ModeId, ModeGroup } from "../types";
import { useAtlasStore } from "./atlas-store";
import { toast } from "./toast-store";
import { mapPort, fx } from "../ports";

// Modes that belong to each screen.
const MAP_MODES: ModeId[] = ["find", "name"];
const EXPERT_MODES: ModeId[] = ["capital", "flag"];
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

export interface RevealState {
  item: Country;
  correct: boolean;
  ms: number;
  mode: ModeId;
  missing?: string[];
  wrong?: string[];
}

// Choice state for MC modes — which button was picked (for visual marking).
export interface ChoiceResult {
  pickedId: string;
  correctId: string;
}

interface QuizState {
  active: boolean;
  session: QuizSession | null;
  current: CurrentQuestion | null;
  answered: boolean;
  reveal: RevealState | null;
  choiceResult: ChoiceResult | null;
  finished: boolean;
  qStartTime: number;
  elapsedMs: number;
  _timerId: ReturnType<typeof setInterval> | null;

  // Per-question difficulty/hint state (reset in next()).
  choices: Country[]; // multiple-choice options; [] when the question is typed
  hintLevel: number; // find mode: how many location hints are shown (0..3)
  eliminatedIds: string[]; // MC modes: options struck out by "eliminate one" hints
  revealedCount: number; // typed modes: letters revealed hangman-style

  start: () => void;
  next: () => void;
  handleTyped: (value: string) => void;
  handleMapSelect: (country: Country) => void;
  handleChoice: (chosen: Country) => void;
  useHint: () => void;
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
  return Logic.filterPool(DataLayer.countries, s.regions);
};

// Modes graded by picking/typing a country name or capital — the ones that
// switch between multiple-choice (easy) and typed (difficult).
const MC_MODES: ModeId[] = ["name", "capital", "flag"];

// The string a hangman/hint reveals for a mode: the capital for capital mode,
// otherwise the country name.
const hintTarget = (item: Country, mode: ModeId): string =>
  mode === "capital" ? item.capital || "" : item.name;

// Candidate pool used to draw multiple-choice options for a given mode. Mirrors
// the per-mode candidate lists next() uses to pick the target.
const candPoolFor = (p: Country[], mode: ModeId): Country[] => {
  if (mode === "capital") return p.filter((c) => c.capital && c.capital !== "—");
  if (mode === "flag") return p.filter((c) => c.cca2);
  return Logic.mapPool(p); // name mode: needs map geometry
};

const PRAISE = ["Nailed it!", "Correct!", "Spot on!", "Yes!", "Geography wizard ✨", "Bang on."];
const praise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];

export const useQuizStore = create<QuizState>((set, get) => ({
  active: false,
  session: null,
  current: null,
  answered: false,
  reveal: null,
  choiceResult: null,
  finished: false,
  qStartTime: 0,
  elapsedMs: 0,
  _timerId: null,
  choices: [],
  hintLevel: 0,
  eliminatedIds: [],
  revealedCount: 0,

  start: () => {
    const atlas = useAtlasStore.getState();
    const s = atlas.settings;
    const modes = activeModes();
    const screen = screenFor(modes);

    // bail if build ended up here somehow
    if (MODES[modes[0]]?.group === "build") return;

    // Only block when there's nothing to ask — multiple-choice gracefully shows
    // fewer than 4 buttons for a tiny pool, and typed mode needs just the one.
    if (pool().length < 1) {
      toast("Pick a broader region — no countries in this selection.", "bad");
      return;
    }

    const t = get()._timerId;
    if (t) clearInterval(t);

    // "Around the world" runs until every askable country in the pool has been
    // asked once — so its total is the count of countries usable by the active
    // modes, not a fixed round length.
    const aroundTotal = (): number => {
      const p = pool();
      const askable = new Set<string>();
      for (const c of p) {
        for (const m of modes) {
          if ((m === "find" || m === "name") && c.feature) askable.add(c.id);
          else if (m === "capital" && c.capital && c.capital !== "—") askable.add(c.id);
          else if (m === "flag" && c.cca2) askable.add(c.id);
        }
      }
      return askable.size || p.length;
    };

    const session: QuizSession = {
      type: s.session,
      screen,
      total: s.session === "round" ? s.roundLen : aroundTotal(),
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
      reveal: null,
      choiceResult: null,
      elapsedMs: 0,
      choices: [],
      hintLevel: 0,
      eliminatedIds: [],
      revealedCount: 0,
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
      mapPort()?.clearHighlights();
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
    let cand: Country[] = [];

    for (const m of order) {
      let c: Country[] = [];
      if (m === "find" || m === "name") {
        c = Logic.mapPool(p);
      } else if (m === "capital") {
        c = p.filter((c) => c.capital && c.capital !== "—");
      } else if (m === "flag") {
        c = p.filter((c) => c.cca2);
      }
      if (!c.length) continue;
      const picked = Logic.selectNextItem(c, leit, m, { avoidId, exclude });
      if (picked) {
        item = picked;
        chosenMode = m;
        cand = c;
        break;
      }
    }

    if (!item || !chosenMode) {
      get().finish();
      return;
    }

    session.askedIds.add(item.id);
    session.asked += 1;

    // Easy difficulty turns name/capital/flag into multiple choice; difficult
    // (and find, which is always map-clicked) stays typed → choices stays [].
    const difficulty = useAtlasStore.getState().settings.quizDifficulty;
    const choices =
      MC_MODES.includes(chosenMode) && difficulty === "easy"
        ? Logic.makeChoices(item, cand, 4)
        : [];

    set({
      current: { item, mode: chosenMode },
      answered: false,
      reveal: null,
      choiceResult: null,
      qStartTime: now(),
      session: { ...session },
      choices,
      hintLevel: 0,
      eliminatedIds: [],
      revealedCount: 0,
    });

    // Map framing for tiny countries.
    if (chosenMode === "find" || chosenMode === "name") {
      const map = mapPort();
      if (map) {
        if (chosenMode === "name") {
          // Name mode highlights the target, so the answer is already shown.
          // Frame tiny countries and drop an arrow so they're easy to spot.
          if (map.tinyIds.has(item.id)) map.frameCountry(item, 0.5);
          else map.reset();
          map.paint(item.id, "target");
          map.markArrow(item);
        } else {
          // Find mode: the player must locate the country themselves, so never
          // auto-zoom to it — that would reveal the answer. Just reset any zoom
          // left over from the previous question; they double-click to zoom in
          // and hunt for small countries.
          map.reset();
        }
      }
    }
  },

  handleTyped: (value: string) => {
    const state = get();
    if (!state.active || state.answered || !state.current) return;
    // In easy/MC mode the answer comes via handleChoice, not the text box.
    if (state.choices.length) return;
    const { item, mode } = state.current;
    const answer = mode === "capital" ? item.capital : item.name;
    get().grade(Logic.matchAnswer(value, answer || ""));
  },

  handleMapSelect: (country: Country) => {
    const state = get();
    // Not an active unanswered map question → show quick info only.
    if (!state.active || state.answered || !state.current) {
      mapPort()?.flashSelect(country.id);
      toast(`${country.name} — capital ${country.capital}`);
      return;
    }
    const { mode, item } = state.current;
    if (MODES[mode]?.group !== "map") {
      // Wrong screen/mode — treat as quick-info.
      mapPort()?.flashSelect(country.id);
      toast(`${country.name} — capital ${country.capital}`);
      return;
    }
    if (mode === "find") {
      const correct = country.id === item.id;
      const map = mapPort();
      if (map) {
        map.paint(country.id, correct ? "good" : "bad");
        if (!correct) {
          map.paint(item.id, "target");
          map.markArrow(item); // point out where it actually was
        }
      }
      get().grade(correct);
    }
    // "name" is answered via MC choices, not map clicks.
  },

  handleChoice: (chosen: Country) => {
    const state = get();
    if (!state.active || state.answered || !state.current) return;
    const { item, mode } = state.current;
    // Only the multiple-choice modes are answered by picking an option.
    if (!MC_MODES.includes(mode)) return;
    const correct = chosen.id === item.id;
    set({ choiceResult: { pickedId: chosen.id, correctId: item.id } });
    // Only name mode lives on the map, so it's the only one to paint.
    if (MODES[mode]?.group === "map") {
      mapPort()?.paint(item.id, correct ? "good" : "target");
    }
    get().grade(correct);
  },

  useHint: () => {
    const state = get();
    if (!state.active || state.answered || !state.current) return;
    const { item, mode } = state.current;

    if (mode === "find") {
      // Location clues escalate: region → subregion → border countries.
      if (state.hintLevel >= 3) return;
      set({ hintLevel: state.hintLevel + 1 });
      fx().hint();
      return;
    }

    if (state.choices.length) {
      // Multiple choice: strike out one remaining wrong option.
      const id = Logic.nextEliminate(state.choices, item.id, state.eliminatedIds);
      if (!id) return;
      set({ eliminatedIds: [...state.eliminatedIds, id] });
      fx().hint();
      return;
    }

    // Typed hangman: the answer stays fully hidden until the first hint. That
    // first press (revealedCount 0→1) shows the all-blank mask; each later press
    // reveals one more letter (never the first — see Logic.revealName). So
    // displayed letters = revealedCount - 1, and the cap is hangmanReveals + 1
    // (the terminal state: every revealable letter shown).
    const answer = hintTarget(item, mode);
    const maxReveal = Logic.hangmanReveals(answer) + 1;
    if (state.revealedCount >= maxReveal) return;
    set({ revealedCount: state.revealedCount + 1 });
    fx().hint();
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
      fx().correct();
      toast(praise(), "good");
      if (session.streak > 0 && session.streak % 5 === 0) {
        fx().confetti();
        fx().milestone();
        toast("🔥 " + session.streak + " in a row!", "good");
      }
    } else {
      session.streak = 0;
      fx().wrong();
      toast("Not quite — it's " + item.name, "bad");
    }

    const atlas = useAtlasStore.getState();
    atlas.recordVerdict({ id: item.id, mode, correct, ms, region: item.region, streak: session.streak });
    atlas.recordBestStreak(session.bestStreak);

    // Refresh heatmap on map screen if it's on.
    if (session.screen === "map" && atlas.settings.heatmap) {
      mapPort()?.refreshColors();
    }

    // Timed mode is a race, so there's no reveal card to dismiss: the score,
    // streak, verdict and toast/sound above are the whole acknowledgement, and
    // we jump straight to the next question. next() advances `asked` exactly as
    // the reveal card's Next would, so the count stays right; on the last
    // question it falls through to finish(). grade() is always the final call in
    // every answer handler, so advancing from here is safe.
    if (session.timed) {
      set({ session });
      get().next();
      return;
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
      const map = mapPort();
      if (map) {
        map.clearHighlights();
        map.reset();
      }
    }

    if (session && (session.type === "round" || session.type === "around")) {
      fx().confetti();
      set({ active: false, finished: true, session, current: null, reveal: null, _timerId: null });
    } else {
      if (session) toast("Session ended in " + Logic.fmtDuration(session.elapsedMs), "good");
      set({ active: false, finished: false, session: null, current: null, reveal: null, _timerId: null });
    }
  },

  quit: () => {
    const t = get()._timerId;
    if (t) clearInterval(t);
    // Clear map highlights on quit.
    const session = get().session;
    if (session?.screen === "map") {
      mapPort()?.clearHighlights();
    }
    set({
      active: false,
      finished: false,
      session: null,
      current: null,
      reveal: null,
      answered: false,
      choiceResult: null,
      _timerId: null,
      choices: [],
      hintLevel: 0,
      eliminatedIds: [],
      revealedCount: 0,
    });
  },
}));
