import { describe, it, expect, beforeEach } from "vitest";
import { defaultState, migrateState, useAtlasStore } from "../stores/atlas-store";
import { setKVStorage } from "../platform";
import { STATE_KEY } from "../constants";
import { memoryKV } from "./platform.test";

beforeEach(async () => {
  setKVStorage(memoryKV());
  await useAtlasStore.persist.rehydrate();
});

describe("defaultState", () => {
  it("is a fresh version-2 state with map modes", () => {
    const d = defaultState();
    expect(d.version).toBe(2);
    expect(d.settings.modes).toEqual(["find", "name"]);
    expect(d.settings.showNames).toBe(true);
    expect(d.leitner).toEqual({});
    expect(d.history).toEqual([]);
    expect(d.stats).toEqual({ answered: 0, correct: 0, bestStreak: 0, streakHistory: [] });
  });
});

describe("migrateState", () => {
  it("returns defaults for junk input", () => {
    expect(migrateState(null)).toEqual(defaultState());
    expect(migrateState(42)).toEqual(defaultState());
    expect(migrateState("nope")).toEqual(defaultState());
  });

  it("merges saved settings onto defaults, filling missing keys", () => {
    const m = migrateState({ settings: { region: "Europe", sound: true } });
    // Legacy single region string migrates into the multi-select array.
    expect(m.settings.regions).toEqual(["Europe"]);
    expect((m.settings as unknown as Record<string, unknown>).region).toBeUndefined();
    expect(m.settings.sound).toBe(true);
    // untouched keys keep their defaults
    expect(m.settings.modes).toEqual(["find", "name"]);
    expect(m.settings.showNames).toBe(true);
  });

  it("maps a legacy 'all' region to an empty array and drops the removed subregion setting", () => {
    const m = migrateState({ settings: { region: "all", subregion: "all", subregions: ["Western Europe"] } });
    expect(m.settings.regions).toEqual([]);
    expect((m.settings as unknown as Record<string, unknown>).subregion).toBeUndefined();
    expect((m.settings as unknown as Record<string, unknown>).subregions).toBeUndefined();
  });

  it("preserves a valid leitner map and history array", () => {
    const raw = {
      leitner: { "840:build": { box: 3, seen: 5, correct: 4, lastSeen: 10 } },
      history: [{ id: "840", mode: "build", correct: true, ms: 1200, region: "Americas", t: 1 }],
    };
    const m = migrateState(raw);
    expect(m.leitner["840:build"].box).toBe(3);
    expect(m.history).toHaveLength(1);
  });

  it("discards a malformed leitner / history and forces version 2", () => {
    const m = migrateState({ version: 1, leitner: "broken", history: "broken" });
    expect(m.leitner).toEqual({});
    expect(m.history).toEqual([]);
    expect(m.version).toBe(2);
  });

  it("accepts the legacy bare single-file shape", () => {
    const legacy = {
      version: 2,
      settings: { region: "Asia", showNames: false },
      leitner: { "392:capital": { box: 2, seen: 1, correct: 1, lastSeen: 0 } },
      history: [],
      stats: { answered: 3, correct: 2, bestStreak: 2, streakHistory: [1, 2] },
    };
    const m = migrateState(legacy);
    expect(m.settings.regions).toEqual(["Asia"]);
    expect(m.settings.showNames).toBe(false);
    expect(m.stats.answered).toBe(3);
    expect(m.leitner["392:capital"].box).toBe(2);
  });
});

describe("store actions", () => {
  beforeEach(() => useAtlasStore.getState().resetProgress());

  it("recordVerdict folds an outcome into leitner, history, and stats", () => {
    useAtlasStore.getState().recordVerdict({
      id: "840",
      mode: "capital",
      correct: true,
      ms: 1200,
      region: "Americas",
    });
    const s = useAtlasStore.getState();
    expect(s.stats.answered).toBe(1);
    expect(s.stats.correct).toBe(1);
    expect(s.history).toHaveLength(1);
    expect(s.leitner["840:capital"].box).toBe(2);
  });

  it("recordVerdict pushes the session streak onto streakHistory when given", () => {
    const rv = useAtlasStore.getState().recordVerdict;
    rv({ id: "840", mode: "capital", correct: true, ms: 100, region: "Americas", streak: 1 });
    rv({ id: "124", mode: "capital", correct: true, ms: 100, region: "Americas", streak: 2 });
    expect(useAtlasStore.getState().stats.streakHistory).toEqual([1, 2]);
  });

  it("recordVerdict leaves streakHistory untouched when streak is omitted", () => {
    useAtlasStore
      .getState()
      .recordVerdict({ id: "840", mode: "capital", correct: false, ms: 100, region: "Americas" });
    expect(useAtlasStore.getState().stats.streakHistory).toEqual([]);
  });

  it("recordBestStreak only ratchets upward", () => {
    const rbs = useAtlasStore.getState().recordBestStreak;
    rbs(3);
    expect(useAtlasStore.getState().stats.bestStreak).toBe(3);
    rbs(2);
    expect(useAtlasStore.getState().stats.bestStreak).toBe(3);
    rbs(7);
    expect(useAtlasStore.getState().stats.bestStreak).toBe(7);
  });

  it("persists through the injected KVStorage", async () => {
    const kv = memoryKV();
    setKVStorage(kv);
    await useAtlasStore.persist.rehydrate();
    useAtlasStore.getState().setSettings({ roundLen: 25 });
    await new Promise((r) => setTimeout(r, 0)); // let async setItem flush
    const raw = kv.data.get(STATE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.settings.roundLen).toBe(25);
  });
});
