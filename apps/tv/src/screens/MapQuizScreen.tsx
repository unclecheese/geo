import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// Cursor starts dead-centre; it persists across questions (the map resets, the
// crosshair stays put) so the player never loses it between finds.
const CURSOR_START = { x: 960, y: 540 };

// Min gap between hover hit-tests. Unlike the web map's free CSS :hover, TV must
// run pickCountryAt (geoContains over every country) itself, which is too heavy
// to do on every rapid pan sample — so throttle it. The crosshair still moves
// every sample (cheap); only the brass fill re-resolves at this cadence.
const HOVER_MS = 45;

/**
 * The find/name quiz, wired end to end. The map controller is the MapPort the
 * quiz store paints/frames/arrows through; this screen owns the Skia map, the
 * floating crosshair, and the remote-input plumbing. Zero quiz logic lives
 * here: a valid pick just calls `handleMapSelect`, and the store decides
 * correct/wrong, painting good/bad + the target arrow.
 *
 * FIND is a free floating cursor (like the web map):
 *   • touch surface pans the cursor coarsely, the dpad nudges it finely;
 *   • single Select picks the country under the cursor (via pickCountryAt,
 *     which honours the tiny-country hit boxes, so microstates are reachable);
 *   • double-tap Select zooms in centred on the cursor (double-tap again zooms
 *     back out) — the map starts every question at world view, never auto-framed;
 *   • the country under the cursor is painted brass (hover), like the web map.
 * NAME mode is unchanged: the native focus engine drives the choices grid /
 * typed input, so the cursor/dpad are gated off there; a plain Select advances
 * the reveal card in both modes.
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
  // sample re-rendered the whole ~470-node map path tree (a delay-then-jump).
  // Instead the live position lives in a ref (read at click time) and the
  // crosshair is pushed imperatively into CursorOverlay, so a move repaints only
  // that 3-node overlay Canvas — never the map Canvas or this screen.
  const cursorRef = useRef({ ...CURSOR_START });
  const overlayRef = useRef<CursorOverlayHandle>(null);
  // Last country the cursor resolved to. Hover repaints the map (a fresh paint
  // Map), so we only do it when the hovered country actually CHANGES, not on
  // every sample — keeps the hover cheap despite the coarse pan firing rapidly.
  const hoveredRef = useRef<string | null>(null);

  // Register the port + subscribe to its visual state, and start the session.
  // Cleanup unregisters the port and quits the session so a re-entry starts
  // clean (no stale paints).
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
  const item = current?.item;
  // Re-arm hover whenever a NEW find question begins (the store resets the map).
  const findItemId = mode === "find" ? current?.item.id ?? null : null;

  // Boxes are static (laid out once by the controller) but arrive with the first
  // bind notification — keep the latest in a ref so the cursor handlers, which
  // close over the controller for their whole lifetime, always see them.
  const boxesRef = useRef(mapState.boxes);
  boxesRef.current = mapState.boxes;

  // Resolve what's under a point and paint that country brass — but only repaint
  // when the hovered country actually changes (a fresh paint Map re-renders the
  // whole map, so we never do it just because the cursor jiggled within one).
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHoverAt = useRef(0);
  const resolveHover = useCallback(
    (pt: { x: number; y: number }) => {
      lastHoverAt.current = Date.now();
      const hit = pickCountryAt(ctl.screenToProjected(pt), DataLayer.countries, boxesRef.current, PROJ);
      const id = hit?.id ?? null;
      if (id !== hoveredRef.current) {
        hoveredRef.current = id;
        ctl.setHighlights(id ? new Map([[id, "hover"]]) : new Map());
      }
    },
    [ctl]
  );

  // Move the cursor: push the crosshair every sample (cheap), but throttle the
  // heavy hover hit-test — with a trailing pass so the fill still lands on the
  // resting country when a fast pan ends mid-throttle.
  const moveCursorTo = useCallback(
    (pt: { x: number; y: number }) => {
      cursorRef.current = pt;
      overlayRef.current?.set(pt);
      if (hoverTimer.current) {
        clearTimeout(hoverTimer.current);
        hoverTimer.current = null;
      }
      const wait = HOVER_MS - (Date.now() - lastHoverAt.current);
      if (wait <= 0) {
        resolveHover(pt);
      } else {
        hoverTimer.current = setTimeout(() => {
          hoverTimer.current = null;
          resolveHover({ ...cursorRef.current });
        }, wait);
      }
    },
    [resolveHover]
  );

  // Show/hide the crosshair with cursor mode, and re-arm the hover each new find
  // question (findItemId) — after the store has reset the map — so the country
  // under the resting cursor lights up immediately.
  useEffect(() => {
    if (cursorMode) {
      hoveredRef.current = null;
      moveCursorTo({ ...cursorRef.current });
    } else {
      if (hoverTimer.current) {
        clearTimeout(hoverTimer.current);
        hoverTimer.current = null;
      }
      overlayRef.current?.set(null);
      hoveredRef.current = null;
    }
  }, [cursorMode, findItemId, moveCursorTo]);

  // Drop any pending hover timer on unmount.
  useEffect(() => () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
  }, []);

  useRemoteInput({
    cursorEnabled: cursorMode,
    advanceEnabled: answered,
    onCursor: moveCursorTo,
    onSingleClick: (c) => {
      const hit = pickCountryAt(ctl.screenToProjected(c), DataLayer.countries, boxesRef.current, PROJ);
      if (hit) useQuizStore.getState().handleMapSelect(hit);
      // Miss (open ocean → null) is a deliberate no-op.
    },
    onDoubleClick: (c) => ctl.zoomToggle(c),
    onAdvance: () => useQuizStore.getState().next(),
    onPlayPause: () => useQuizStore.getState().useHint(),
  });

  // Menu/Back pops to the Menu screen (unmount runs the quit() cleanup above).
  useMenuButtonBack(() => nav.goBack());

  // Derived HUD-card content. Find shows a prompt + sub + escalating hint list;
  // name shows the prompt + choices/typed + a hint button.
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
      <CursorOverlay ref={overlayRef} />

      <Scorebar />

      {/* The single web-style question card, anchored bottom-centre. In find
          (cursor) mode it's pointer-transparent so it never steals the cursor
          or blocks a pick behind it; in name mode it's interactive so the focus
          engine can drive the choices grid / typed input. */}
      {item && !answered && (
        <View style={styles.hudWrap} pointerEvents={cursorMode ? "none" : "box-none"}>
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
                  <QSub>Move the cursor and Select. Double-tap to zoom.</QSub>
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
    // The HUD is a wide (90%) rounded card floating just off the bottom edge
    // (see QuizCard's "bar" variant): centre it and leave a visible gap below.
    position: "absolute",
    bottom: 28,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
});
