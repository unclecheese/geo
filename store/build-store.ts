import { create } from "zustand";
import { BuildGraph } from "@/lib/build-graph";
import { DataLayer } from "@/lib/data-layer";
import { Logic } from "@/lib/logic";
import { Audio2, Confetti } from "@/lib/fx";
import { useAtlasStore } from "@/store/atlas-store";
import { toast } from "@/store/toast-store";
import type { Country } from "@/lib/types";
import type { BuildModel as ViewBuildModel } from "@/lib/build-view";

export interface BuildSession {
  timed: boolean;
  startTime: number;
  elapsedMs: number;
  mistakes: number;
  lastEventTime: number;
}

export interface BuildDoneSummary {
  continent: string;
  n: number;
  mistakes: number;
  timed: boolean;
  elapsedMs: number;
}

interface BuildState {
  active: boolean;
  model: ViewBuildModel | null;
  session: BuildSession | null;
  done: BuildDoneSummary | null;
  _timerId: ReturnType<typeof setInterval> | null;

  start: () => void;
  afterPlace: (country: Country) => void;
  afterMistake: () => void;
  hint: (country: Country) => void;
  checkComplete: () => void;
  finish: () => void;
  quit: () => void;
}

const now = () =>
  typeof performance !== "undefined" ? performance.now() : Date.now();

// Module-level helper — keeps _recordVerdict out of the zustand interface
// while still having access to the session via its parameter.
function doRecordVerdict(country: Country, correct: boolean, session: BuildSession) {
  const n = now();
  const ms = Math.max(0, Math.round(n - (session.lastEventTime || session.startTime)));
  session.lastEventTime = n;
  useAtlasStore.getState().recordVerdict({
    id: country.id,
    mode: "build",
    correct,
    ms,
    region: country.region,
  });
}

export const useBuildStore = create<BuildState>((set, get) => ({
  active: false,
  model: null,
  session: null,
  done: null,
  _timerId: null,

  start() {
    const atlas = useAtlasStore.getState();
    const s = atlas.settings;
    const continent = s.region;

    if (!(BuildGraph.SUPPORTED as readonly string[]).includes(continent)) {
      toast("Pick a continent to build.", "bad");
      return;
    }

    const graph = BuildGraph.build(
      DataLayer.countries.filter((c) => c.feature),
      continent
    );
    if (!graph.buildable) {
      toast("That continent can't be built yet.", "bad");
      return;
    }

    // Stop any running timer.
    const old = get()._timerId;
    if (old) clearInterval(old);

    const model: ViewBuildModel = {
      continent,
      graph,
      seed: null,
      placedIds: new Set<string>(),
      revealedIds: new Set<string>(),
    };

    const session: BuildSession = {
      timed: s.timed,
      startTime: now(),
      elapsedMs: 0,
      mistakes: 0,
      lastEventTime: now(),
    };

    set({ active: true, model, session, done: null });

    // Session stopwatch — dynamic import avoids circular dep at module level.
    const tick = () => {
      const st = get().session;
      if (!st) return;
      st.elapsedMs = now() - st.startTime;
      if (st.timed) {
        import("@/lib/build-view").then(({ BuildView }) => {
          if (BuildView._inited) BuildView.setTimer(Logic.fmtDuration(st.elapsedMs));
        });
      }
    };
    tick();
    const id = setInterval(tick, 500);
    set({ _timerId: id });

    // Drive BuildView imperatively for the initial show.
    import("@/lib/build-view").then(({ BuildView }) => {
      if (BuildView._inited) {
        BuildView.show(model);
        BuildView.setTimer(session.timed ? Logic.fmtDuration(0) : null);
      }
    });
  },

  afterPlace(country: Country) {
    const state = get();
    if (!state.active || !state.model || !state.session) return;
    const session = state.session;
    const model = state.model;

    const showNames = useAtlasStore.getState().settings.showNames !== false;
    if (showNames) {
      doRecordVerdict(country, true, session);
      get().checkComplete();
    } else {
      // Unnamed mode: prompt for the name; grade on the typed answer.
      import("@/lib/build-view").then(({ BuildView }) => {
        if (!BuildView._inited) return;
        BuildView.showNamePrompt((typed: string) => {
          const correct = Logic.matchAnswer(typed, country.name);
          doRecordVerdict(country, correct, session);
          if (!correct) {
            model.revealedIds.add(country.id);
            BuildView._redrawPlaced();
            toast("It's " + country.name, "bad");
          } else {
            toast("Correct — " + country.name, "good");
          }
          BuildView.hideNamePrompt();
          get().checkComplete();
        });
      });
    }
  },

  afterMistake() {
    const session = get().session;
    if (session) session.mistakes += 1;
  },

  hint(country: Country) {
    const state = get();
    if (!state.active || !state.model || !state.session) return;
    if (state.model.placedIds.has(country.id)) return;

    state.model.placedIds.add(country.id);
    state.session.mistakes += 1;
    doRecordVerdict(country, false, state.session);

    const showNames = useAtlasStore.getState().settings.showNames !== false;
    if (!showNames) {
      state.model.revealedIds.add(country.id);
      toast("It's " + country.name, "bad");
    }

    import("@/lib/build-view").then(({ BuildView }) => {
      if (BuildView._inited) BuildView.revealPlace(country);
    });
    get().checkComplete();
  },

  checkComplete() {
    const state = get();
    if (!state.model || !state.active) return;
    if (state.model.placedIds.size >= state.model.graph.placeable.length) {
      get().finish();
    }
  },

  finish() {
    const state = get();
    const t = state._timerId;
    if (t) clearInterval(t);

    const session = state.session;
    if (session) session.elapsedMs = now() - session.startTime;

    Confetti.burst();
    Audio2.milestone();

    const n = state.model?.graph.placeable.length ?? 0;
    const done: BuildDoneSummary = {
      continent: state.model?.continent ?? "",
      n,
      mistakes: session?.mistakes ?? 0,
      timed: session?.timed ?? false,
      elapsedMs: session?.elapsedMs ?? 0,
    };

    import("@/lib/build-view").then(({ BuildView }) => {
      if (BuildView._inited) BuildView.setTimer(null);
    });

    set({ active: false, done, _timerId: null });
  },

  quit() {
    const t = get()._timerId;
    if (t) clearInterval(t);
    set({ active: false, model: null, session: null, done: null, _timerId: null });
  },
}));
