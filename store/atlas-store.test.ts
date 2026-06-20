import { describe, it, expect } from "vitest";
import { defaultState, migrateState } from "@/store/atlas-store";

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
    expect(m.settings.region).toBe("Europe");
    expect(m.settings.sound).toBe(true);
    // untouched keys keep their defaults
    expect(m.settings.modes).toEqual(["find", "name"]);
    expect(m.settings.showNames).toBe(true);
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
    expect(m.settings.region).toBe("Asia");
    expect(m.settings.showNames).toBe(false);
    expect(m.stats.answered).toBe(3);
    expect(m.leitner["392:capital"].box).toBe(2);
  });
});
