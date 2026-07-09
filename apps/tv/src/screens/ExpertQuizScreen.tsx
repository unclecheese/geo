import { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { useTVEventHandler, type HWEvent } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { DataLayer, MODES, useAtlasStore, useQuizStore } from "@geobean/core";
import type { RootStackParamList } from "../navigation";
import { useMenuButtonBack } from "../input/useMenuButtonBack";
import { Scorebar } from "../components/Scorebar";
import { QuizCard, QPrompt, Em, QSub } from "../components/QuizCard";
import { RevealCard } from "../components/RevealCard";
import { ChoicesGrid } from "../components/ChoicesGrid";
import { FlagImage } from "../components/FlagImage";
import { TypedAnswer } from "../components/TypedAnswer";
import { theme } from "../theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The expert quiz (capital + flag) — no map, no MapPort. `screenFor` already
 * routes these modes to `"quiz"` and the store runs its mapless path. Focus is
 * entirely native here: this screen never mounts `useRemoteInput` (that hook
 * drives the map cursor/pan), so there's no double-fire risk with the bare
 * `useTVEventHandler` below — it's the only playPause listener on this screen,
 * and Play/Pause is the (invisible, as on web) hint affordance.
 *
 * Same web-style question card as the map screen (see QuizCard), just centred
 * rather than bottom-anchored since there's no map behind it.
 */
export function ExpertQuizScreen() {
  const nav = useNavigation<Nav>();

  useEffect(() => {
    useQuizStore.getState().start();
    return () => {
      useQuizStore.getState().quit();
    };
  }, []);

  useTVEventHandler((event: HWEvent) => {
    if (event.eventType === "playPause") useQuizStore.getState().useHint();
  });

  // Menu/Back pops to Menu (unmount runs the quit() cleanup) instead of exiting.
  useMenuButtonBack(() => nav.goBack());

  const current = useQuizStore((s) => s.current);
  const answered = useQuizStore((s) => s.answered);
  const finished = useQuizStore((s) => s.finished);
  const reveal = useQuizStore((s) => s.reveal);
  const session = useQuizStore((s) => s.session);
  const choices = useQuizStore((s) => s.choices);
  const choiceResult = useQuizStore((s) => s.choiceResult);
  const eliminatedIds = useQuizStore((s) => s.eliminatedIds);
  const revealedCount = useQuizStore((s) => s.revealedCount);
  const difficult = useAtlasStore((s) => s.settings.quizDifficulty === "difficult");

  useEffect(() => {
    if (finished) nav.navigate("Results");
  }, [finished, nav]);

  const item = current?.item;
  const mode = current?.mode;
  const kicker = mode ? MODES[mode].label : "—";

  return (
    <View style={styles.root}>
      <Scorebar />

      {item && !answered && (
        <QuizCard kicker={kicker} asked={session?.asked ?? 0} total={session?.total ?? 0}>
          {mode === "flag" && (
            <View style={styles.flagWrap}>
              <FlagImage country={item} />
            </View>
          )}

          {mode === "capital" ? (
            <>
              <QPrompt>
                What is the capital of <Em>{item.name}</Em>?
              </QPrompt>
              <QSub>{difficult ? "Type the city name" : "Pick the capital"}</QSub>
            </>
          ) : (
            <>
              <QPrompt>Which country&apos;s flag is this?</QPrompt>
              <QSub>{difficult ? "Type the country name" : "Pick the country"}</QSub>
            </>
          )}

          {choices.length > 0 ? (
            <ChoicesGrid
              choices={choices}
              choiceResult={choiceResult}
              eliminatedIds={eliminatedIds}
              onChoose={(c) => useQuizStore.getState().handleChoice(c)}
              labelFor={mode === "capital" ? (c) => c.capital || "—" : undefined}
            />
          ) : (
            <TypedAnswer
              mode={mode === "capital" ? "capital" : "name"}
              item={item}
              pool={DataLayer.countries}
              revealedCount={revealedCount}
              onSubmit={(t) => useQuizStore.getState().handleTyped(t)}
            />
          )}
        </QuizCard>
      )}

      {answered && reveal && (
        <RevealCard reveal={reveal} onNext={() => useQuizStore.getState().next()} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" },
  flagWrap: { alignItems: "center", marginBottom: 24 },
});
