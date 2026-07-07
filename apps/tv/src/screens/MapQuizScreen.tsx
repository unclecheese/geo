import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { DataLayer, pickCountryAt, setMapPort, useQuizStore } from "@geobean/core";
import type { RootStackParamList } from "../navigation";
import { createTvMapController, type TvMapState } from "../map/tv-map-controller";
import { TvMap, PROJ } from "../map/TvMap";
import { useRemoteInput } from "../input/useRemoteInput";
import { Scorebar } from "../components/Scorebar";
import { HintPanel } from "../components/HintPanel";
import { RevealCard } from "../components/RevealCard";
import { ChoicesGrid } from "../components/ChoicesGrid";
import { TypedAnswer } from "../components/TypedAnswer";
import { theme } from "../theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** How far one dpad press pans the map, in projected px. Exported so Task 18's
 *  hardware pass can tune it in one place. */
export const DPAD_PAN_STEP = 160;

const CURSOR_START = { x: 960, y: 540 };

/**
 * The find quiz, wired end to end. The map controller is the MapPort the quiz
 * store paints/frames/arrows through; this screen owns only the DOM-ish pieces
 * — the Skia map, the crosshair cursor, and the remote-input plumbing — plus
 * the FOCUS-mode chrome. Zero quiz logic lives here: a valid click just calls
 * `handleMapSelect`, and the store decides correct/wrong, painting and the
 * target arrow.
 *
 * Input-mode machine (single source): the remote is a CURSOR only during an
 * unanswered find question; every other state (reveal up, name mode, finished)
 * is FOCUS so the native focus engine owns Select/dpad and can drive the
 * reveal's buttons and the name-mode choices grid. Play/Pause always maps to
 * `useHint()` via `useRemoteInput`'s unconditional playPause branch — that one
 * registration covers find and name alike, so no second handler is wired here.
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
  const [cursor, setCursor] = useState(CURSOR_START);

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

  const cursorMode = mode === "find" && !answered;

  // Boxes are static (laid out once by the controller), but they arrive with the
  // first bind notification — keep the latest in a ref so the click handler,
  // which closes over the controller for its whole lifetime, always sees them.
  const boxesRef = useRef(mapState.boxes);
  boxesRef.current = mapState.boxes;

  useRemoteInput({
    enabled: cursorMode,
    onCursor: setCursor,
    onSingleClick: (c) => {
      const hit = pickCountryAt(ctl.screenToProjected(c), DataLayer.countries, boxesRef.current, PROJ);
      if (hit) useQuizStore.getState().handleMapSelect(hit);
      // Miss (open ocean → null) is a deliberate no-op.
    },
    onDoubleClick: (c) => ctl.zoomToggle(c),
    onDpad: (dir) => {
      const d = DPAD_PAN_STEP;
      if (dir === "up") ctl.panBy(0, d);
      else if (dir === "down") ctl.panBy(0, -d);
      else if (dir === "left") ctl.panBy(d, 0);
      else ctl.panBy(-d, 0);
    },
    onPlayPause: () => useQuizStore.getState().useHint(),
  });

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
        cursor={cursorMode ? cursor : null}
      />

      {current?.mode === "find" && !answered && (
        <View style={styles.prompt} pointerEvents="none">
          <Text style={styles.promptLabel}>Find</Text>
          <Text style={styles.promptName}>{current.item.name}</Text>
        </View>
      )}

      {current?.mode === "name" && !answered && (
        <View style={styles.prompt} pointerEvents="none">
          <Text style={styles.promptLabel}>Name the highlighted country</Text>
        </View>
      )}

      <Scorebar />

      {current?.mode === "find" && !answered && (
        <HintPanel item={current.item} hintLevel={hintLevel} />
      )}

      {current?.mode === "name" && choices.length > 0 && (
        <View style={styles.choicesBand} pointerEvents={answered ? "none" : "box-none"}>
          <ChoicesGrid
            choices={choices}
            choiceResult={choiceResult}
            eliminatedIds={eliminatedIds}
            onChoose={(c) => useQuizStore.getState().handleChoice(c)}
          />
        </View>
      )}

      {current?.mode === "name" && choices.length === 0 && !answered && (
        <View style={styles.typedBand}>
          <TypedAnswer
            mode="name"
            item={current.item}
            pool={DataLayer.countries}
            revealedCount={revealedCount}
            onSubmit={(t) => useQuizStore.getState().handleTyped(t)}
          />
        </View>
      )}

      {answered && reveal && (
        <RevealCard
          reveal={reveal}
          onNext={() => useQuizStore.getState().next()}
          onEnd={() => {
            useQuizStore.getState().quit();
            nav.navigate("Menu");
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.sea },
  prompt: {
    position: "absolute",
    top: 40,
    left: 56,
    backgroundColor: "rgba(14, 31, 51, 0.82)",
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: theme.brass,
    paddingVertical: 14,
    paddingHorizontal: 28,
    zIndex: 20,
  },
  promptLabel: {
    color: theme.creamDim,
    fontSize: 16,
    letterSpacing: 2,
    fontVariant: ["small-caps"],
  },
  promptName: { color: theme.cream, fontSize: 40, fontFamily: "Georgia", fontWeight: "700" },
  choicesBand: {
    position: "absolute",
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
  typedBand: {
    position: "absolute",
    bottom: 48,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
});
