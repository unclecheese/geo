import { describe, it, expect, beforeEach, vi } from "vitest";

// MapView is browser-only; stub it so withMap() no-ops (it gates on _inited).
vi.mock("@/lib/map-view", () => ({ MapView: { _inited: false } }));
// Capture toast messages so we can assert "close" vs plain "wrong".
vi.mock("@/store/toast-store", () => ({ toast: vi.fn() }));

import { useBordersStore } from "@/store/borders-store";
import { toast } from "@/store/toast-store";
import type { Country } from "@/lib/types";
import type { QuizSession } from "@/store/quiz-store";

const mk = (id: string, name: string): Country =>
  ({ id, name, region: "Europe", neighbours: [], feature: {} } as unknown as Country);

const FRANCE = mk("250", "France");
const SPAIN = mk("724", "Spain");
const GERMANY = mk("276", "Germany");
const ITALY = mk("380", "Italy");
const REQUIRED = [SPAIN, GERMANY, ITALY];

const baseSession = (): QuizSession => ({
  type: "round",
  screen: "map",
  total: 10,
  timed: false,
  asked: 1,
  score: 0,
  streak: 0,
  bestStreak: 0,
  correct: 0,
  askedIds: new Set(["250"]),
  startTime: 0,
  elapsedMs: 0,
});

// Seed the store mid-question (target framed, awaiting clicks).
const seed = (over: Partial<ReturnType<typeof useBordersStore.getState>> = {}) =>
  useBordersStore.setState({
    active: true,
    answered: false,
    finished: false,
    session: baseSession(),
    target: FRANCE,
    required: REQUIRED,
    foundIds: new Set(),
    revealedIds: new Set(),
    activeId: null,
    qStartTime: 0,
    reveal: null,
    ...over,
  });

beforeEach(() => {
  vi.mocked(toast).mockClear();
});

describe("borders-store: naming a selected sliver", () => {
  it("accepts the correct name and locks the neighbour green", () => {
    seed({ activeId: SPAIN.id });
    useBordersStore.getState().submitName("Spain");
    const s = useBordersStore.getState();
    expect([...s.foundIds]).toContain(SPAIN.id);
    expect(s.activeId).toBeNull();
    expect(s.answered).toBe(false); // two neighbours still to find
  });

  it("treats another real neighbour as a gentle 'Close!' miss, not a found", () => {
    seed({ activeId: SPAIN.id });
    useBordersStore.getState().submitName("Germany"); // a neighbour, wrong sliver
    const s = useBordersStore.getState();
    expect(s.foundIds.size).toBe(0); // nothing locked in
    expect(s.activeId).toBe(SPAIN.id); // stays on the same sliver (retry)
    expect(vi.mocked(toast).mock.calls.at(-1)?.[0]).toMatch(/Close!/);
  });

  it("treats a non-neighbour name as a plain retry", () => {
    seed({ activeId: SPAIN.id });
    useBordersStore.getState().submitName("Brazil");
    const s = useBordersStore.getState();
    expect(s.foundIds.size).toBe(0);
    expect(s.activeId).toBe(SPAIN.id);
    expect(vi.mocked(toast).mock.calls.at(-1)?.[0]).toMatch(/Not quite/);
  });

  it("empty submit (skip) deselects the sliver", () => {
    seed({ activeId: SPAIN.id });
    useBordersStore.getState().submitName("");
    expect(useBordersStore.getState().activeId).toBeNull();
  });
});

describe("borders-store: completing a question", () => {
  it("marks correct when every neighbour is named (no reveals)", () => {
    seed({ foundIds: new Set([SPAIN.id, GERMANY.id]), activeId: ITALY.id });
    useBordersStore.getState().submitName("Italy");
    const s = useBordersStore.getState();
    expect(s.answered).toBe(true);
    expect(s.reveal?.correct).toBe(true);
    expect(s.reveal?.item).toBe(FRANCE);
    expect(s.session?.correct).toBe(1);
  });

  it("revealAll gives up: marks incorrect and lists the unfound as missing", () => {
    seed({ foundIds: new Set([SPAIN.id]) });
    useBordersStore.getState().revealAll();
    const s = useBordersStore.getState();
    expect(s.answered).toBe(true);
    expect(s.reveal?.correct).toBe(false);
    expect(s.reveal?.missing?.sort()).toEqual([GERMANY.id, ITALY.id].sort());
    expect(s.session?.streak).toBe(0);
  });
});

describe("borders-store: clicking the map", () => {
  it("selects a neighbour for naming, ignores the target, rejects non-neighbours", () => {
    seed();
    const st = useBordersStore.getState();

    st.handleMapClick(FRANCE); // the home country
    expect(useBordersStore.getState().activeId).toBeNull();

    st.handleMapClick({ id: "076", name: "Brazil" } as unknown as Country); // not a neighbour
    expect(useBordersStore.getState().activeId).toBeNull();

    st.handleMapClick(GERMANY); // a real neighbour
    expect(useBordersStore.getState().activeId).toBe(GERMANY.id);
  });
});
