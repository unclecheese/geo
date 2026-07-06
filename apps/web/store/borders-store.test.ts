import { describe, it, expect, beforeEach, vi } from "vitest";

// Isolate the store from browser-only deps.
vi.mock("@/store/toast-store", () => ({ toast: vi.fn() }));
vi.mock("@/lib/fx", () => ({
  Audio2: { correct: vi.fn(), wrong: vi.fn(), milestone: vi.fn(), ensure: vi.fn() },
  Confetti: { burst: vi.fn() },
}));

import { useBordersStore } from "@/store/borders-store";
import { useAtlasStore } from "@/store/atlas-store";
import type { Country } from "@/lib/types";
import type { QuizSession } from "@/store/quiz-store";

const mk = (id: string, name: string): Country =>
  ({ id, name, region: "Europe", neighbours: [], feature: {}, centroid: [0, 0] } as unknown as Country);

const FRANCE = mk("250", "France");
const SPAIN = mk("724", "Spain");
const GERMANY = mk("276", "Germany");
const ITALY = mk("380", "Italy");
const PORTUGAL = mk("620", "Portugal"); // distractor: not a neighbour here

const baseSession = (): QuizSession => ({
  type: "round", screen: "quiz", total: 10, timed: false,
  asked: 1, score: 0, streak: 0, bestStreak: 0, correct: 0,
  askedIds: new Set(["250"]), startTime: 0, elapsedMs: 0,
});

// Seed the store mid-question, awaiting answers.
const seed = (over: Partial<ReturnType<typeof useBordersStore.getState>> = {}) =>
  useBordersStore.setState({
    active: true, answered: false, finished: false,
    session: baseSession(), target: FRANCE,
    shown: [SPAIN, GERMANY, ITALY],
    candidates: [], easy: false, assign: {}, typed: {},
    reveal: null, qStartTime: 0, elapsedMs: 0, _timerId: null,
    ...over,
  });

beforeEach(() => {
  useAtlasStore.setState({ leitner: {}, history: [], stats: { answered: 0, correct: 0, bestStreak: 0, streakHistory: [] } });
});

describe("borders submit — difficult (typed)", () => {
  it("marks the question correct only when every blank matches", () => {
    seed({ easy: false, typed: { 1: "spain", 2: "germany", 3: "italy" } });
    useBordersStore.getState().submit();
    const st = useBordersStore.getState();
    expect(st.answered).toBe(true);
    expect(st.reveal!.correct).toBe(true);
    expect(st.reveal!.results.every((r) => r.ok)).toBe(true);
  });

  it("is incorrect (all-or-nothing) when one blank is wrong, with per-blank results", () => {
    seed({ easy: false, typed: { 1: "spain", 2: "germany", 3: "belgium" } });
    useBordersStore.getState().submit();
    const st = useBordersStore.getState();
    expect(st.reveal!.correct).toBe(false);
    expect(st.reveal!.results.map((r) => r.ok)).toEqual([true, true, false]);
  });
});

describe("borders submit — easy (matching)", () => {
  it("is correct when neighbours map to their numbers and distractors are left unassigned", () => {
    seed({
      easy: true,
      candidates: [SPAIN, GERMANY, ITALY, PORTUGAL],
      assign: { "724": 1, "276": 2, "380": 3, "620": null },
    });
    useBordersStore.getState().submit();
    expect(useBordersStore.getState().reveal!.correct).toBe(true);
  });

  it("is incorrect when a distractor is assigned a number", () => {
    seed({
      easy: true,
      candidates: [SPAIN, GERMANY, ITALY, PORTUGAL],
      assign: { "724": 1, "276": 2, "380": 3, "620": 1 },
    });
    useBordersStore.getState().submit();
    expect(useBordersStore.getState().reveal!.correct).toBe(false);
  });
});

describe("borders setAssign", () => {
  it("gives a badge number to at most one candidate (steals it)", () => {
    seed({ easy: true, candidates: [SPAIN, GERMANY], assign: { "724": 1 } });
    useBordersStore.getState().setAssign("276", 1);
    const a = useBordersStore.getState().assign;
    expect(a["724"]).toBeNull();
    expect(a["276"]).toBe(1);
  });
});

describe("borders submit — verdict recorded", () => {
  it("records a single border verdict for the target", () => {
    seed({ easy: false, typed: { 1: "spain", 2: "germany", 3: "italy" } });
    useBordersStore.getState().submit();
    expect(useAtlasStore.getState().leitner["250:border"]).toBeTruthy();
    expect(useAtlasStore.getState().stats.answered).toBe(1);
  });
});
