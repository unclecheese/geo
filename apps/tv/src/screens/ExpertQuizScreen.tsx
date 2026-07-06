import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTVEventHandler, type HWEvent } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useAtlasStore, useQuizStore } from "@geobean/core";
import type { RootStackParamList } from "../navigation";
import { Scorebar } from "../components/Scorebar";
import { RevealCard } from "../components/RevealCard";
import { ChoicesGrid } from "../components/ChoicesGrid";
import { FlagImage } from "../components/FlagImage";
import { theme } from "../theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The expert quiz (capital + flag) — no map, no MapPort. `screenFor` already
 * routes these modes to `"quiz"` and the store runs its mapless path (Task 4
 * verified that's safe). Focus is entirely native here: this screen never
 * mounts `useRemoteInput` (that hook drives the map cursor/pan), so there's no
 * double-fire risk with the bare `useTVEventHandler` below — it's the only
 * playPause listener on this screen.
 *
 * TODO(16): remove — typed expert answers arrive in Task 16. Until then, force
 * easy (MC) for this session only, same session-scoped override MapQuizScreen
 * uses, since difficult mode has no TextInput yet and would be unanswerable.
 */
export function ExpertQuizScreen() {
  const nav = useNavigation<Nav>();

  useEffect(() => {
    useAtlasStore.getState().setQuizDifficultyOverride("easy");
    useQuizStore.getState().start();
    return () => {
      useQuizStore.getState().quit();
      useAtlasStore.getState().setQuizDifficultyOverride(null);
    };
  }, []);

  useTVEventHandler((event: HWEvent) => {
    if (event.eventType === "playPause") useQuizStore.getState().useHint();
  });

  const current = useQuizStore((s) => s.current);
  const answered = useQuizStore((s) => s.answered);
  const finished = useQuizStore((s) => s.finished);
  const reveal = useQuizStore((s) => s.reveal);
  const choices = useQuizStore((s) => s.choices);
  const choiceResult = useQuizStore((s) => s.choiceResult);
  const eliminatedIds = useQuizStore((s) => s.eliminatedIds);

  useEffect(() => {
    if (finished) nav.navigate("Results");
  }, [finished, nav]);

  return (
    <View style={styles.root}>
      <Scorebar />

      {current?.mode === "capital" && !answered && (
        <View style={styles.prompt} pointerEvents="none">
          <Text style={styles.promptLabel}>What's the capital of</Text>
          <Text style={styles.promptName}>{current.item.name}</Text>
        </View>
      )}

      {current?.mode === "flag" && !answered && (
        <View style={styles.flagWrap}>
          <FlagImage country={current.item} />
        </View>
      )}

      {current && choices.length > 0 && (
        <View style={styles.choicesBand} pointerEvents={answered ? "none" : "box-none"}>
          <ChoicesGrid
            choices={choices}
            choiceResult={choiceResult}
            eliminatedIds={eliminatedIds}
            onChoose={(c) => useQuizStore.getState().handleChoice(c)}
            labelFor={current.mode === "capital" ? (c) => c.capital || "—" : undefined}
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
  root: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" },
  prompt: {
    position: "absolute",
    top: 120,
    alignItems: "center",
  },
  promptLabel: {
    color: theme.creamDim,
    fontSize: 20,
    letterSpacing: 2,
    fontVariant: ["small-caps"],
  },
  promptName: { color: theme.cream, fontSize: 48, fontFamily: "Georgia", fontWeight: "700" },
  flagWrap: {
    position: "absolute",
    top: 110,
    alignItems: "center",
  },
  choicesBand: {
    position: "absolute",
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 20,
  },
});
