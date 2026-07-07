import { describe, it, expect, beforeEach } from "vitest";
import { useQuizStore } from "../stores/quiz-store";
import { useAtlasStore } from "../stores/atlas-store";
import { setKVStorage } from "../platform";
import { setMapPort, type MapPort } from "../ports";
import { DataLayer } from "../data-layer";
import { memoryKV } from "./platform.test";
import type { Country, ModeId } from "../types";
import type { QuizSession } from "../stores/quiz-store";

const mk = (id: string, name: string, capital: string): Country =>
  ({ id, name, capital, region: "Europe", subregion: "Southern Europe", neighbours: [] } as unknown as Country);

const ITALY = mk("380", "Italy", "Rome");
const SPAIN = mk("724", "Spain", "Madrid");
const FRANCE = mk("250", "France", "Paris");
const GREECE = mk("300", "Greece", "Athens");
const CHOICES = [ITALY, SPAIN, FRANCE, GREECE];

const baseSession = (): QuizSession => ({
  type: "round",
  screen: "quiz",
  total: 10,
  timed: false,
  asked: 1,
  score: 0,
  streak: 0,
  bestStreak: 0,
  correct: 0,
  askedIds: new Set(["380"]),
  startTime: 0,
  elapsedMs: 0,
});

// Seed the store mid-question with the given mode + difficulty shape.
const seed = (mode: ModeId, over: Partial<ReturnType<typeof useQuizStore.getState>> = {}) =>
  useQuizStore.setState({
    active: true,
    answered: false,
    finished: false,
    session: baseSession(),
    current: { item: ITALY, mode },
    reveal: null,
    choiceResult: null,
    qStartTime: 0,
    choices: [],
    hintLevel: 0,
    eliminatedIds: [],
    revealedCount: 0,
    ...over,
  });

beforeEach(async () => {
  setKVStorage(memoryKV());
  await useAtlasStore.persist.rehydrate();
  useAtlasStore.getState().resetProgress();
  // No MapPort by default — most grading tests run map-free (expert modes).
  setMapPort(null);
});

describe("quiz-store: multiple-choice grading (easy)", () => {
  it("marks the picked option correct when it is the item", () => {
    seed("capital", { choices: CHOICES });
    useQuizStore.getState().handleChoice(ITALY);
    const s = useQuizStore.getState();
    expect(s.answered).toBe(true);
    expect(s.reveal?.correct).toBe(true);
    expect(s.choiceResult).toEqual({ pickedId: ITALY.id, correctId: ITALY.id });
  });

  it("marks a wrong pick incorrect and records the correct id", () => {
    seed("flag", { choices: CHOICES });
    useQuizStore.getState().handleChoice(SPAIN);
    const s = useQuizStore.getState();
    expect(s.answered).toBe(true);
    expect(s.reveal?.correct).toBe(false);
    expect(s.choiceResult).toEqual({ pickedId: SPAIN.id, correctId: ITALY.id });
  });

  it("ignores a typed submission while in MC mode", () => {
    seed("capital", { choices: CHOICES });
    useQuizStore.getState().handleTyped("Rome");
    expect(useQuizStore.getState().answered).toBe(false);
  });
});

describe("quiz-store: typed grading (difficult)", () => {
  it("grades a typed country name (name mode, no choices)", () => {
    seed("name", { choices: [] });
    useQuizStore.getState().handleTyped("Italy");
    expect(useQuizStore.getState().reveal?.correct).toBe(true);
  });

  it("grades a typed capital (capital mode)", () => {
    seed("capital", { choices: [] });
    useQuizStore.getState().handleTyped("Rome");
    expect(useQuizStore.getState().reveal?.correct).toBe(true);
  });

  it("marks a wrong typed answer incorrect", () => {
    seed("capital", { choices: [] });
    useQuizStore.getState().handleTyped("Madrid");
    expect(useQuizStore.getState().reveal?.correct).toBe(false);
  });
});

describe("quiz-store: hints", () => {
  it("find mode escalates the location hint level, capped at 3", () => {
    seed("find");
    const { useHint } = useQuizStore.getState();
    useHint();
    expect(useQuizStore.getState().hintLevel).toBe(1);
    useHint();
    useHint();
    useHint();
    expect(useQuizStore.getState().hintLevel).toBe(3);
  });

  it("MC mode eliminates wrong options without ever striking the answer", () => {
    seed("capital", { choices: CHOICES });
    const { useHint } = useQuizStore.getState();
    useHint();
    useHint();
    useHint();
    const s = useQuizStore.getState();
    // 4 options, 1 is correct → at most 3 can be eliminated.
    expect(s.eliminatedIds.length).toBe(3);
    expect(s.eliminatedIds).not.toContain(ITALY.id);
    // A further hint is a no-op (nothing eligible left).
    useHint();
    expect(useQuizStore.getState().eliminatedIds.length).toBe(3);
  });

  it("typed name mode reveals the mask then letters, capped at letterCount + 1", () => {
    seed("name", { choices: [] });
    const { useHint } = useQuizStore.getState();
    // First hint reveals the all-blank mask (revealedCount 1 = 0 letters shown).
    useHint();
    expect(useQuizStore.getState().revealedCount).toBe(1);
    // "Italy" has 5 letters; letters shown = revealedCount - 1, so it caps at 6.
    for (let i = 0; i < 10; i++) useHint();
    expect(useQuizStore.getState().revealedCount).toBe(6);
  });

  it("typed capital mode reveals letters of the CAPITAL, not the country", () => {
    seed("capital", { choices: [] });
    const { useHint } = useQuizStore.getState();
    for (let i = 0; i < 20; i++) useHint();
    // "Rome" has 4 letters; caps at letterCount + 1 (the all-blank mask step).
    expect(useQuizStore.getState().revealedCount).toBe(5);
  });
});

describe("quiz-store: MapPort integration", () => {
  it("runs a find question safely with no MapPort registered", () => {
    setMapPort(null);
    seed("find");
    expect(() => useQuizStore.getState().handleMapSelect(ITALY)).not.toThrow();
    const s = useQuizStore.getState();
    expect(s.answered).toBe(true);
    expect(s.reveal?.correct).toBe(true);
  });

  it("frames tiny countries through the MapPort in name mode", () => {
    const calls: string[] = [];
    const fake: MapPort = {
      isReady: () => true,
      tinyIds: new Set(["380"]),
      clearHighlights() { calls.push("clear"); },
      flashSelect() {},
      frameCountry: (c) => calls.push("frame:" + c.id),
      markArrow: (c) => calls.push("arrow:" + c.id),
      paint: (id, kind) => calls.push(`paint:${id}:${kind}`),
      refreshColors() {},
      reset: () => calls.push("reset"),
    };
    setMapPort(fake);

    // Only candidate with map geometry is ITALY (id "380", the registered tiny
    // id), so a real next() deterministically targets it in name mode.
    const prevCountries = DataLayer.countries;
    DataLayer.countries = [{ ...ITALY, feature: {} } as unknown as Country];
    useAtlasStore.getState().setSettings({ modes: ["name"] as ModeId[], regions: [] });

    useQuizStore.getState().start();

    DataLayer.countries = prevCountries;

    expect(useQuizStore.getState().current).toEqual({ item: expect.objectContaining({ id: "380" }), mode: "name" });
    expect(calls).toContain("frame:380");
    expect(calls).toContain("paint:380:target");
    expect(calls).toContain("arrow:380");
  });
});

