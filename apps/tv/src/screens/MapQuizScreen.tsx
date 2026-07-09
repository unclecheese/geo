import { useEffect, useMemo, useRef, useState } from "react";
import { View, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  DataLayer,
  Logic,
  MODES,
  pickCountryAt,
  setMapPort,
  useAtlasStore,
  useQuizStore,
} from "@geobean/core";
import type { RootStackParamList } from "../navigation";
import { createTvMapController, type TvMapState } from "../map/tv-map-controller";
import { TvMap, PROJ } from "../map/TvMap";
import { CursorOverlay, type CursorOverlayHandle } from "../map/CursorOverlay";
import { useRemoteInput } from "../input/useRemoteInput";
import { useMenuButtonBack } from "../input/useMenuButtonBack";
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
  // The cursor is deliberately NOT React state: setting state on every pan
  // sample re-rendered this screen and the ~470-node map path tree, which
  // batched into a delay-then-jump. Instead the live position lives in a ref
  // (read at click time) and the crosshair is pushed imperatively into the
  // CursorOverlay, so a pan sample repaints only that 3-node overlay Canvas.
  const cursorRef = useRef({ ...CURSOR_START });
  const overlayRef = useRef<CursorOverlayHandle>(null);

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

  const cursorMode = mode === "find" && !answered;

  // Derived HUD-card content, mirroring apps/web/app/map/page.tsx. The card is
  // the single question surface now (no top-left banner): find shows a prompt +
  // sub + escalating hint list; name shows the prompt + choices/typed + a hint.
  const item = current?.item;

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

  // Boxes are static (laid out once by the controller), but they arrive with the
  // first bind notification — keep the latest in a ref so the click handler,
  // which closes over the controller for its whole lifetime, always sees them.
  const boxesRef = useRef(mapState.boxes);
  boxesRef.current = mapState.boxes;

  // Push the crosshair into the overlay whenever cursor mode turns on/off:
  // show it at the ref's current spot when active, clear it otherwise (reveal
  // up, name mode, finished). Motion updates come through onCursor below.
  useEffect(() => {
    overlayRef.current?.set(cursorMode ? { ...cursorRef.current } : null);
  }, [cursorMode]);

  useRemoteInput({
    enabled: cursorMode,
    onCursor: (c) => {
      cursorRef.current = c;
      overlayRef.current?.set(c);
    },
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

  // Menu/Back pops to the Menu screen (unmount runs the quit() cleanup above)
  // rather than quitting the app.
  useMenuButtonBack(() => nav.goBack());

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
      <CursorOverlay ref={overlayRef} />

      <Scorebar />

      {/* The single web-style question card, anchored bottom-centre. In find
          (cursor) mode it's pointer-transparent so it never steals the cursor
          or blocks a map click behind it; in name mode it's interactive so the
          focus engine can drive the choices grid / typed input. */}
      {item && !answered && (
        <View style={styles.hudWrap} pointerEvents={cursorMode ? "none" : "box-none"}>
          <QuizCard kicker={kicker} asked={session?.asked ?? 0} total={session?.total ?? 0}>
            {mode === "find" && (
              <>
                <QPrompt>
                  Find <Em>{item.name}</Em> on the map
                </QPrompt>
                <QSub>Click the country (zoom in for small ones)</QSub>
                <HintList hints={findHints} />
                <HintNote label={hintLevel >= 3 ? "No more hints" : "Play/Pause for a hint"} />
              </>
            )}

            {mode === "name" && (
              <>
                <QPrompt>
                  Name the <Em>highlighted</Em> country
                </QPrompt>
                <QSub>It&apos;s glowing on the map</QSub>
                {choices.length > 0 ? (
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
                )}
                <HintButton
                  label={nameHintLabel}
                  disabled={hintExhausted}
                  onPress={() => useQuizStore.getState().useHint()}
                />
              </>
            )}
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
    position: "absolute",
    bottom: 44,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
});
