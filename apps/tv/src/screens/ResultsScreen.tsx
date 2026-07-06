import { View, Text, Pressable, StyleSheet, type PressableStateCallbackType } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Logic, useQuizStore } from "@geobean/core";
import type { RootStackParamList } from "../navigation";
import { theme } from "../theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * End-of-round summary. Reads the finished `session` off the quiz store (the
 * store keeps it live after `finish()` sets `finished`). A stub for now — score,
 * accuracy and time plus "Back to menu"; Task 14 fleshes it out. Back clears the
 * session via `quit()` and returns to the Menu.
 */
export function ResultsScreen() {
  const nav = useNavigation<Nav>();
  const session = useQuizStore((s) => s.session);

  const back = () => {
    useQuizStore.getState().quit();
    nav.navigate("Menu");
  };

  const accuracy =
    session && session.asked ? Math.round((session.correct / session.asked) * 100) : 0;

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Round complete</Text>
      {session && (
        <View style={styles.stats}>
          <Stat label="Score" value={String(session.score)} />
          <Stat label="Correct" value={`${session.correct} / ${session.asked}`} />
          <Stat label="Accuracy" value={`${accuracy}%`} />
          <Stat label="Best streak" value={String(session.bestStreak)} />
          <Stat label="Time" value={Logic.fmtDuration(session.elapsedMs)} />
        </View>
      )}
      <Pressable
        onPress={back}
        hasTVPreferredFocus
        style={(state: PressableStateCallbackType) => [
          styles.btn,
          state.focused && styles.btnFocused,
        ]}
      >
        <Text style={styles.btnText}>← Back to menu</Text>
      </Pressable>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" },
  title: { color: theme.cream, fontSize: 56, fontFamily: "Georgia", fontWeight: "700", marginBottom: 40 },
  stats: { flexDirection: "row", gap: 28, marginBottom: 48 },
  stat: {
    backgroundColor: "rgba(244, 236, 218, 0.06)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(199, 180, 137, 0.3)",
    paddingVertical: 20,
    paddingHorizontal: 28,
    alignItems: "center",
    minWidth: 130,
  },
  statValue: { color: theme.cream, fontSize: 40, fontFamily: "Georgia", fontWeight: "700" },
  statLabel: { color: theme.creamDim, fontSize: 15, letterSpacing: 1, marginTop: 4, fontVariant: ["small-caps"] },
  btn: {
    backgroundColor: theme.parchment,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 36,
  },
  btnFocused: { borderColor: theme.brass, transform: [{ scale: 1.08 }] },
  btnText: { color: theme.ink, fontSize: 24, fontWeight: "700" },
});
