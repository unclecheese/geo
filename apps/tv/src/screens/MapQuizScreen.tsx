import { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  DataLayer,
  Logic,
  MODES,
  NAV_REGIONS,
  buildFindGraph,
  setMapPort,
  useAtlasStore,
  useQuizStore,
  type Country,
  type Dir,
  type NavRegionId,
} from "@geobean/core";
import type { RootStackParamList } from "../navigation";
import { createTvMapController, type TvMapState } from "../map/tv-map-controller";
import { TvMap, type PaintKind } from "../map/TvMap";
import { useRemoteInput } from "../input/useRemoteInput";
import { useMenuButtonBack } from "../input/useMenuButtonBack";
import {
  buildRegionDpad,
  defaultRegion,
  regionStartCountry,
} from "../input/region-dpad";
import { Scorebar } from "../components/Scorebar";
import {
  QuizCard,
  QPrompt,
  Em,
  QSub,
  HintList,
  HintButton,
  HintNote,
} from "../components/QuizCard";
import { RevealCard } from "../components/RevealCard";
import { ChoicesGrid } from "../components/ChoicesGrid";
import { TypedAnswer } from "../components/TypedAnswer";
import { theme } from "../theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// Siri-Remote dpad direction → compass direction the graphs are keyed by.
const DPAD_TO_DIR: Record<"up" | "down" | "left" | "right", Dir> = {
  up: "n",
  down: "s",
  left: "w",
  right: "e",
};

/**
 * The find/name quiz, wired end to end. The map controller is the MapPort the
 * quiz store paints/frames/arrows through; this screen owns the Skia map and
 * the remote-input plumbing.
 *
 * FIND is a two-stage dpad flow (no cursor):
 *   1. REGION PICKER — globe view, every askable country dim-tinted by region,
 *      one region emphasised. dpad moves the emphasis between regions (nearest
 *      in that compass direction); Select zooms into the region and enters…
 *   2. COUNTRY NAV — zoomed into the region, exactly one (unlabelled) country
 *      is highlighted. dpad walks the within-region find-graph n/e/s/w; Select
 *      confirms it as the answer via `handleMapSelect` (the store grades and
 *      paints good/bad + the target). Menu backs out to the region picker.
 * NAME mode is unchanged: the native focus engine drives the choices grid /
 * typed input in the QuizCard, so dpad/select are gated off there.
 */
export function MapQuizScreen() {
  const nav = useNavigation<Nav>();
  const ctl = useMemo(createTvMapController, []);

  const [mapState, setMapState] = useState<TvMapState>(() => ({
    transform: { k: 1, tx: 0, ty: 0 },
    paints: new Map(),
    boxes: [],
    arrow: null,
  }));

  // Find navigation is built once per session (like the map paths): the
  // within-region directional graph, region→region dpad adjacency, id→country
  // lookup, per-region member lists, and the dim "these are the regions" base
  // paint the picker starts from.
  const findNav = useMemo(() => {
    const { graph, regions } = buildFindGraph(DataLayer.countries);
    const byId = new Map(DataLayer.countries.map((c) => [c.id, c] as const));
    const regionCentroid = new Map(NAV_REGIONS.map((r) => [r.id, r.centroid] as const));
    const memberCountries = {} as Record<NavRegionId, Country[]>;
    const dimBase = new Map<string, PaintKind>();
    for (const r of NAV_REGIONS) {
      const ids = regions[r.id] ?? [];
      memberCountries[r.id] = ids.map((id) => byId.get(id)).filter((c): c is Country => !!c);
      for (const id of ids) dimBase.set(id, "region");
    }
    return { graph, byId, regionDpad: buildRegionDpad(), regionCentroid, memberCountries, dimBase };
  }, []);

  const [stage, setStage] = useState<"region" | "country">("region");
  const [selRegion, setSelRegion] = useState<NavRegionId>(() => defaultRegion());
  const [curId, setCurId] = useState<string | null>(null);

  // Register the port + subscribe to its visual state, and start the session.
  // Cleanup unregisters the port and quits the session so a re-entry starts
  // clean (no stale paints, no double timer).
  useEffect(() => {
    setMapPort(ctl);
    const unbind = ctl.bind(setMapState);
    useQuizStore.getState().start();
    return () => {
      unbind();
      setMapPort(null);
      useQuizStore.getState().quit();
    };
  }, [ctl]);

  const mode = useQuizStore((s) => s.current?.mode);
  const answered = useQuizStore((s) => s.answered);
  const finished = useQuizStore((s) => s.finished);
  const reveal = useQuizStore((s) => s.reveal);
  const current = useQuizStore((s) => s.current);
  const hintLevel = useQuizStore((s) => s.hintLevel);
  const choices = useQuizStore((s) => s.choices);
  const choiceResult = useQuizStore((s) => s.choiceResult);
  const eliminatedIds = useQuizStore((s) => s.eliminatedIds);
  const revealedCount = useQuizStore((s) => s.revealedCount);

  const session = useQuizStore((s) => s.session);
  const difficult = useAtlasStore((s) => s.settings.quizDifficulty === "difficult");

  const findActive = mode === "find" && !answered;
  const item = current?.item;
  // Re-init the region picker whenever a NEW find question begins.
  const findItemId = mode === "find" ? current?.item.id ?? null : null;

  // Paint the region picker: every askable country dim, the selected region's
  // members emphasised. One setHighlights → one repaint.
  const paintRegionPicker = useCallback(
    (region: NavRegionId) => {
      const m = new Map(findNav.dimBase);
      for (const c of findNav.memberCountries[region]) m.set(c.id, "sel");
      ctl.setHighlights(m);
    },
    [ctl, findNav]
  );

  // A fresh find question → globe view, region picker on the default region.
  // (The store's next() already reset the map; we just paint the groups.)
  useEffect(() => {
    if (mode !== "find" || answered || !findItemId) return;
    const start = defaultRegion();
    setStage("region");
    setSelRegion(start);
    setCurId(null);
    ctl.reset();
    paintRegionPicker(start);
  }, [findItemId, mode, answered, ctl, paintRegionPicker]);

  const onDpad = useCallback(
    (d: "up" | "down" | "left" | "right") => {
      // Reveal card up: ignore dpad (don't walk the hidden highlight).
      if (answered) return;
      const dir = DPAD_TO_DIR[d];
      if (stage === "region") {
        const next = findNav.regionDpad[selRegion]?.[dir];
        if (next && next !== selRegion) {
          setSelRegion(next);
          paintRegionPicker(next);
        }
      } else if (curId) {
        const next = findNav.graph[curId]?.[dir];
        const nextC = next ? findNav.byId.get(next) : undefined;
        if (next && nextC) {
          setCurId(next);
          ctl.setHighlights(new Map([[next, "sel"]]));
          // Pan the camera to follow the highlight toward the region's edges
          // (e.g. Niger→Algeria pans up) so it never hides behind the HUD.
          ctl.ensureVisible(nextC);
        }
      }
    },
    [answered, stage, selRegion, curId, findNav, ctl, paintRegionPicker]
  );

  const onSelect = useCallback(() => {
    // Reveal card up (find OR name): Select advances to the next question.
    // The Next button is non-focusable, so this is the only path — no
    // double-advance. Matches the imperative input model the rest of find uses.
    if (answered) {
      useQuizStore.getState().next();
      return;
    }
    if (stage === "region") {
      const members = findNav.memberCountries[selRegion];
      if (!members.length) return;
      ctl.frameRegion(members);
      const start = regionStartCountry(members, findNav.regionCentroid.get(selRegion)!);
      setStage("country");
      setCurId(start.id);
      ctl.setHighlights(new Map([[start.id, "sel"]]));
    } else if (curId) {
      const c = findNav.byId.get(curId);
      if (c) useQuizStore.getState().handleMapSelect(c);
    }
  }, [answered, stage, selRegion, curId, findNav, ctl]);

  // Select is live while the reveal card is up (both find and name mode show it),
  // as well as during an unanswered find question.
  useRemoteInput({
    enabled: findActive || answered,
    onDpad,
    onSelect,
    onPlayPause: () => useQuizStore.getState().useHint(),
  });

  // Menu/Back: in country-nav it backs out to the region picker; otherwise it
  // pops to the Menu screen (unmount runs the quit() cleanup above). The handler
  // re-registers each render, so it always sees the current stage.
  useMenuButtonBack(() => {
    if (mode === "find" && !answered && stage === "country") {
      setStage("region");
      setCurId(null);
      ctl.reset();
      paintRegionPicker(selRegion);
    } else {
      nav.goBack();
    }
  });

  // Derived HUD-card content. Find shows a prompt + stage sub + escalating hint
  // list; name shows the prompt + choices/typed + a hint button.
  const findHints: string[] = [];
  if (mode === "find" && item) {
    if (hintLevel >= 1) findHints.push(`Region: ${item.region}`);
    if (hintLevel >= 2 && item.subregion) findHints.push(`Subregion: ${item.subregion}`);
    if (hintLevel >= 3) {
      const names = item.neighbours.map((n) => n.name);
      findHints.push(names.length ? `Borders: ${names.join(", ")}` : "Island — no land borders");
    }
  }

  // Name-mode hint state (find hints come via the remote's Play/Pause, so the
  // find card only shows a static note). Easy eliminates a wrong option; hard
  // reveals a hangman letter — same exhaustion rules as web.
  let hintUsed = false;
  let hintExhausted = false;
  if (mode === "name" && !difficult && item) {
    hintUsed = eliminatedIds.length > 0;
    hintExhausted = choices.every((c) => c.id === item.id || eliminatedIds.includes(c.id));
  } else if (mode === "name" && difficult && item) {
    hintUsed = revealedCount > 0;
    hintExhausted = revealedCount >= Logic.hangmanReveals(item.name) + 1;
  }
  const nameHintLabel = hintExhausted
    ? "No more hints"
    : hintUsed
      ? "Show another hint"
      : "Show hint";

  const kicker = mode ? MODES[mode].label : "—";

  // Round over → Results.
  useEffect(() => {
    if (finished) nav.navigate("Results");
  }, [finished, nav]);

  return (
    <View style={styles.root}>
      <TvMap
        transform={mapState.transform}
        paints={mapState.paints}
        boxes={mapState.boxes}
      />

      <Scorebar />

      {/* The single web-style question card, anchored bottom-centre. In find
          mode it's pointer-transparent so it never grabs focus off the dpad
          navigation; in name mode it's interactive so the focus engine can
          drive the choices grid / typed input. */}
      {item && !answered && (
        <View style={styles.hudWrap} pointerEvents={findActive ? "none" : "box-none"}>
          <QuizCard
            variant="bar"
            kicker={kicker}
            asked={session?.asked ?? 0}
            total={session?.total ?? 0}
            body={
              mode === "find" ? (
                <>
                  <QPrompt>
                    Find <Em>{item.name}</Em> on the map
                  </QPrompt>
                  <QSub>
                    {stage === "region"
                      ? "Pick the region it's in"
                      : "Navigate to the country, then select"}
                  </QSub>
                </>
              ) : (
                <>
                  <QPrompt>
                    Name the <Em>highlighted</Em> country
                  </QPrompt>
                  <QSub>It&apos;s glowing on the map</QSub>
                </>
              )
            }
            hint={
              mode === "find" ? (
                <HintNote label={hintLevel >= 3 ? "No more hints" : "Play/Pause for a hint"} />
              ) : (
                <HintButton
                  label={nameHintLabel}
                  disabled={hintExhausted}
                  onPress={() => useQuizStore.getState().useHint()}
                  inline
                />
              )
            }
          >
            {mode === "find" && findHints.length > 0 && <HintList hints={findHints} />}
            {mode === "name" &&
              (choices.length > 0 ? (
                <ChoicesGrid
                  choices={choices}
                  choiceResult={choiceResult}
                  eliminatedIds={eliminatedIds}
                  onChoose={(c) => useQuizStore.getState().handleChoice(c)}
                />
              ) : (
                <TypedAnswer
                  mode="name"
                  item={item}
                  pool={DataLayer.countries}
                  revealedCount={revealedCount}
                  onSubmit={(t) => useQuizStore.getState().handleTyped(t)}
                />
              ))}
          </QuizCard>
        </View>
      )}

      {answered && reveal && (
        <RevealCard reveal={reveal} onNext={() => useQuizStore.getState().next()} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.sea },
  hudWrap: {
    // The HUD is now a full-width bar flush to the bottom edge (see QuizCard's
    // "bar" variant) — no gutter, no centring; the bar spans the whole width.
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
});
