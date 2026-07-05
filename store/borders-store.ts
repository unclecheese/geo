import { create } from "zustand";
import { Logic } from "@/lib/logic";
import { DataLayer } from "@/lib/data-layer";
import { Audio2, Confetti } from "@/lib/fx";
import { useAtlasStore } from "@/store/atlas-store";
import { toast } from "@/store/toast-store";
import type { Country } from "@/lib/types";
import type { QuizSession, RevealState } from "@/store/quiz-store";

// "Borders" module: a target country is framed at constant size; the player
// clicks each neighbouring sliver and names it. Retry-friendly (no penalty for
// wrong guesses); giving up reveals the rest and marks the target as missed.
// Map-based, so it drives the MapView singleton like the find/name quiz, but its
// multi-target click→name loop is distinct enough to warrant its own store.

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

// A neighbour is answerable only if it has geometry/marker to click on.
const clickable = (c: Country): boolean => !!(c.feature || c.centroid);
const neighboursOf = (c: Country): Country[] => c.neighbours.filter(clickable);

const pool = (): Country[] => {
  const s = useAtlasStore.getState().settings;
  return Logic.filterPool(DataLayer.countries, s.regions, s.subregions);
};

// Targets: framable countries in the active pool that have ≥1 clickable neighbour.
const targetPool = (): Country[] =>
  pool().filter((c) => clickable(c) && neighboursOf(c).length > 0);

const PRAISE = ["Nailed it!", "Correct!", "Spot on!", "Yes!", "Bang on."];
const praise = () => PRAISE[Math.floor(Math.random() * PRAISE.length)];

const withMap = (fn: (mv: typeof import("@/lib/map-view").MapView) => void) => {
  import("@/lib/map-view").then(({ MapView }) => {
    if (MapView._inited) fn(MapView);
  });
};

interface BordersState {
  active: boolean;
  session: QuizSession | null;
  target: Country | null;
  required: Country[]; // neighbours to identify
  foundIds: Set<string>;
  revealedIds: Set<string>; // neighbours given up on
  activeId: string | null; // sliver currently selected for naming
  answered: boolean; // question complete, reveal showing
  reveal: RevealState | null;
  finished: boolean;
  qStartTime: number;
  elapsedMs: number;
  _timerId: ReturnType<typeof setInterval> | null;

  start: () => void;
  next: () => void;
  handleMapClick: (country: Country) => void;
  submitName: (value: string) => void;
  revealAll: () => void;
  quit: () => void;
  _complete: () => void;
}

export const useBordersStore = create<BordersState>((set, get) => ({
  active: false,
  session: null,
  target: null,
  required: [],
  foundIds: new Set(),
  revealedIds: new Set(),
  activeId: null,
  answered: false,
  reveal: null,
  finished: false,
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
      screen: "map",
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
      required: [],
      foundIds: new Set(),
      revealedIds: new Set(),
      activeId: null,
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

    withMap((mv) => mv.clearHighlights());

    if (session.asked >= session.total) {
      // Wrap up the session (mirrors quiz-store.finish for round/around types).
      const t = state._timerId;
      if (t) clearInterval(t);
      session.elapsedMs = session.startTime ? now() - session.startTime : session.elapsedMs;
      withMap((mv) => mv.reset());
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
      // Nothing left to ask — end the round early.
      set({ session: { ...session, total: session.asked } });
      get().next();
      return;
    }

    session.askedIds.add(picked.id);
    session.asked += 1;

    set({
      target: picked,
      required: neighboursOf(picked),
      foundIds: new Set(),
      revealedIds: new Set(),
      activeId: null,
      answered: false,
      reveal: null,
      qStartTime: now(),
      session: { ...session },
    });

    withMap((mv) => {
      mv.frameConstant(picked);
      mv.paintBorders({ homeId: picked.id, foundIds: [] });
    });
  },

  handleMapClick: (country: Country) => {
    const state = get();
    if (!state.active || state.answered || !state.target) return;
    const target = state.target;

    if (country.id === target.id) {
      toast(`That's ${target.name} — name the countries that border it.`);
      return;
    }
    if (state.foundIds.has(country.id)) {
      toast(`${country.name} — already found ✓`, "good");
      return;
    }
    const isNeighbour = state.required.some((n) => n.id === country.id);
    if (!isNeighbour) {
      withMap((mv) => mv.flashSelect(country.id));
      toast(`${country.name} doesn't border ${target.name}.`, "bad");
      return;
    }
    // Select this sliver for naming.
    set({ activeId: country.id });
    withMap((mv) =>
      mv.paintBorders({ homeId: target.id, foundIds: [...state.foundIds], activeId: country.id })
    );
  },

  submitName: (value: string) => {
    const state = get();
    if (!state.active || state.answered || !state.target || !state.activeId) return;
    const target = state.target;
    const activeCountry = state.required.find((n) => n.id === state.activeId);
    if (!activeCountry) return;

    // Empty submit (Skip) = deselect the sliver, let them choose another.
    if (!value.trim()) {
      set({ activeId: null });
      withMap((mv) => mv.paintBorders({ homeId: target.id, foundIds: [...state.foundIds] }));
      return;
    }

    if (Logic.matchAnswer(value, activeCountry.name)) {
      const foundIds = new Set(state.foundIds);
      foundIds.add(activeCountry.id);
      Audio2.correct();
      toast(`${praise()} ${activeCountry.name} ✓`, "good");
      set({ foundIds, activeId: null });
      withMap((mv) => mv.paintBorders({ homeId: target.id, foundIds: [...foundIds] }));
      if (foundIds.size >= state.required.length) get()._complete();
      return;
    }

    // Wrong — but is it another (real) neighbour? Give a gentler nudge.
    const elsewhere = state.required.find(
      (n) => n.id !== activeCountry.id && !state.foundIds.has(n.id) && Logic.matchAnswer(value, n.name)
    );
    Audio2.wrong();
    if (elsewhere) {
      toast(`Close! ${elsewhere.name} borders ${target.name}, but it's in a different place.`);
    } else {
      toast("Not quite — try again.", "bad");
    }
    // Stay on the same sliver (retry, no penalty).
  },

  revealAll: () => {
    const state = get();
    if (!state.active || state.answered || !state.target) return;
    const revealedIds = new Set(state.revealedIds);
    for (const n of state.required) if (!state.foundIds.has(n.id)) revealedIds.add(n.id);
    set({ revealedIds, activeId: null });
    get()._complete();
  },

  quit: () => {
    const t = get()._timerId;
    if (t) clearInterval(t);
    withMap((mv) => {
      mv.clearHighlights();
      mv.reset();
    });
    set({
      active: false,
      finished: false,
      session: null,
      target: null,
      required: [],
      foundIds: new Set(),
      revealedIds: new Set(),
      activeId: null,
      answered: false,
      reveal: null,
      _timerId: null,
    });
  },

  // ---- internal ----
  _complete: () => {
    const state = get();
    const target = state.target;
    const session = state.session;
    if (!target || !session) return;

    const ms = Math.round(now() - state.qStartTime);
    const correct = state.revealedIds.size === 0;
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
        toast(`All ${state.required.length} neighbours of ${target.name}!`, "good");
      }
    } else {
      s.streak = 0;
      Audio2.wrong();
      toast(`Revealed — ${target.name} has ${state.required.length} neighbours.`, "bad");
    }

    const atlas = useAtlasStore.getState();
    atlas.recordVerdict({ id: target.id, mode: "border", correct, ms, region: target.region, streak: s.streak });
    atlas.recordBestStreak(s.bestStreak);

    // Final board: home amber, found green, missed (revealed) red.
    withMap((mv) => {
      mv.clearHighlights();
      mv.paint(target.id, "target");
      for (const id of state.foundIds) mv.paint(id, "good");
      for (const id of state.revealedIds) mv.paint(id, "bad");
      if (atlas.settings.heatmap) {
        /* heatmap repaint happens on next() via clearHighlights */
      }
    });

    set({
      answered: true,
      session: s,
      reveal: {
        item: target,
        correct,
        ms,
        mode: "border",
        missing: [...state.revealedIds],
      },
    });
  },
}));
