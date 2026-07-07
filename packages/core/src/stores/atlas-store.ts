import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import { Logic } from "../logic";
import { STATE_KEY, STATE_VERSION } from "../constants";
import type { AtlasState, HistoryEntry, ModeId, Settings } from "../types";
import { getKVStorage } from "../platform";

export function defaultState(): AtlasState {
  return {
    version: STATE_VERSION,
    settings: {
      modes: ["find", "name"] as ModeId[],
      regions: [] as string[],
      quizDifficulty: "easy" as const,
      session: "round",
      roundLen: 15,
      timed: false,
      sound: false,
      heatmap: false,
      showNames: true, // continent builder: labelled tiles (off = name-for-credit)
      buildDifficulty: "easy" as const,
      rotateRandom: false,
    },
    leitner: {}, // "id:mode" -> { box, seen, correct, lastSeen }
    history: [], // [{ id, mode, correct, ms, region, t }]
    stats: { answered: 0, correct: 0, bestStreak: 0, streakHistory: [] },
  };
}

/**
 * Merge a raw blob onto defaults so missing keys are filled — the same guard
 * the single-file `State._migrate` used. Pure; also handles the legacy bare
 * shape written by the pre-Next app.
 */
export function migrateState(raw: unknown): AtlasState {
  const d = defaultState();
  if (!raw || typeof raw !== "object") return d;
  const r = raw as Partial<AtlasState>;
  const settings = { ...d.settings, ...(r.settings || {}) };
  // Migrate the pre-multi-select single region string → an array ("all" meant no
  // filter, so it becomes an empty array). The subregion setting was removed as
  // too granular — drop any persisted region/subregion remnants.
  const rs = (r.settings || {}) as Record<string, unknown>;
  if (!Array.isArray(rs.regions)) {
    settings.regions = typeof rs.region === "string" && rs.region !== "all" ? [rs.region] : [];
  }
  if (settings.quizDifficulty !== "difficult") settings.quizDifficulty = "easy";
  delete (settings as Record<string, unknown>).region;
  delete (settings as Record<string, unknown>).subregion;
  delete (settings as Record<string, unknown>).subregions;
  // "endless" was removed in favour of "around the world".
  if (settings.session === "endless") settings.session = "around";
  // Derive a difficulty for states saved before it existed (off = name-for-credit).
  if (!(r.settings && (r.settings as Partial<Settings>).buildDifficulty)) {
    settings.buildDifficulty = settings.showNames === false ? "hard" : "easy";
  }
  return {
    version: STATE_VERSION,
    settings,
    stats: { ...d.stats, ...(r.stats || {}) },
    leitner: r.leitner && typeof r.leitner === "object" ? r.leitner : {},
    history: Array.isArray(r.history) ? r.history : [],
  };
}

/**
 * KVStorage adapter that understands both zustand's `{ state, version }`
 * wrapper and the legacy bare object the single-file app wrote under the same
 * key — so a user's existing progress survives the cutover.
 */
const legacyAwareStorage: StateStorage = {
  getItem: async (name) => {
    const kv = getKVStorage();
    if (!kv) return null;
    const raw = await kv.get(name);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && "state" in parsed) return raw; // already ours
      // Legacy bare single-file format → wrap + migrate into zustand's shape.
      return JSON.stringify({ state: migrateState(parsed), version: STATE_VERSION });
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => { await getKVStorage()?.set(name, value); },
  removeItem: async (name) => { await getKVStorage()?.remove(name); },
};

interface VerdictInput {
  id: string;
  mode: ModeId;
  correct: boolean;
  ms: number;
  region: string;
  // Post-grade session streak, pushed onto the (capped) streak history for the
  // dashboard sparkline. Optional so non-quiz callers (Build) can omit it.
  streak?: number;
}

export interface AtlasStore extends AtlasState {
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  setSettings: (patch: Partial<Settings>) => void;
  recordVerdict: (v: VerdictInput) => void;
  recordBestStreak: (n: number) => void;
  resetProgress: () => void;
  importState: (json: string | object) => void;
  exportState: () => string;
}

export const useAtlasStore = create<AtlasStore>()(
  persist(
    (set, get) => ({
      ...defaultState(),
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),

      setSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      // Fold one outcome into Leitner + history + stats under "id:mode" — the
      // shared core of the old Quiz grading and Build._recordVerdict.
      recordVerdict: ({ id, mode, correct, ms, region, streak }) =>
        set((s) => {
          const key = id + ":" + mode;
          const entry: HistoryEntry = { id, mode, correct, ms, region, t: Date.now() };
          const history = s.history.concat(entry);
          if (history.length > 1000) history.splice(0, history.length - 1000);
          const streakHistory =
            streak == null ? s.stats.streakHistory : s.stats.streakHistory.concat(streak);
          if (streakHistory.length > 200) streakHistory.splice(0, streakHistory.length - 200);
          return {
            leitner: { ...s.leitner, [key]: Logic.leitnerUpdate(s.leitner[key], correct) },
            history,
            stats: {
              ...s.stats,
              answered: s.stats.answered + 1,
              correct: s.stats.correct + (correct ? 1 : 0),
              streakHistory,
            },
          };
        }),

      // bestStreak lives in stats but is driven by the live session streak, which
      // recordVerdict has no knowledge of — the quiz store reports it separately.
      recordBestStreak: (n) =>
        set((s) => ({ stats: { ...s.stats, bestStreak: Math.max(s.stats.bestStreak, n) } })),

      resetProgress: () => set({ ...defaultState() }),

      importState: (json) => {
        const parsed = typeof json === "string" ? JSON.parse(json) : json;
        const migrated = migrateState(parsed);
        if (!migrated) throw new Error("Invalid state file");
        set({ ...migrated });
      },

      exportState: () => {
        const { version, settings, leitner, history, stats } = get();
        return JSON.stringify({ version, settings, leitner, history, stats }, null, 2);
      },
    }),
    {
      name: STATE_KEY,
      version: STATE_VERSION,
      storage: createJSONStorage(() => legacyAwareStorage),
      // Hydration must wait until a platform registers storage via
      // setKVStorage — otherwise the store would race an unregistered
      // adapter and silently start from defaults. Platforms call
      // useAtlasStore.persist.rehydrate() explicitly after registering.
      skipHydration: true,
      // Run persisted state through migrateState so older saves gain new setting
      // defaults (e.g. buildDifficulty) and retired values (session "endless")
      // are normalised — zustand's default shallow merge would skip all that.
      merge: (persisted, current) => ({ ...current, ...migrateState(persisted) }),
      // Persist only the data — never the actions or the hydration flag.
      partialize: (s) => ({
        version: s.version,
        settings: s.settings,
        leitner: s.leitner,
        history: s.history,
        stats: s.stats,
      }),
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
    }
  )
);
