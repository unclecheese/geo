import { View, Text, Pressable, StyleSheet, type PressableStateCallbackType } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Logic, useQuizStore } from "@geobean/core";
import type { RootStackParamList } from "../navigation";
import { theme } from "../theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * End-of-round summary — the tvOS port of web's `Results.tsx` modal (score,
 * accuracy, best streak, questions, time). Reads the finished `session` off
 * the quiz store, which keeps it live after `finish()` sets `finished`.
 * "Play again" routes back to the family screen for `session.screen`
 * ("map" → MapQuiz; only map is wired end to end so far) whose mount effect
 * calls `start()` fresh; "Menu" clears the session via `quit()`.
 */
export function ResultsScreen() {
  const nav = useNavigation<Nav>();
  const session = useQuizStore((s) => s.session);

  const playAgain = () => {
    nav.navigate(session?.screen === "map" ? "MapQuiz" : "ExpertQuiz");
  };
  const toMenu = () => {
    useQuizStore.getState().quit();
    nav.navigate("Menu");
  };

  const accuracy =
    session && session.asked ? Math.round((session.correct / session.asked) * 100) : 0;
  const title =
    accuracy >= 80 ? "Brilliant round!" : accuracy >= 50 ? "Nice work!" : "Keep practising!";

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        {session && (
          <>
            <Text style={styles.sub}>
              {session.correct} of {session.asked} correct
              {session.timed ? ` · ${Logic.fmtDuration(session.elapsedMs)}` : ""}
            </Text>
            <View style={styles.stats}>
              <Stat label="Score" value={String(session.score)} accent />
              <Stat label="Accuracy" value={`${accuracy}%`} good />
              <Stat label="Best streak" value={String(session.bestStreak)} />
              <Stat label="Questions" value={String(session.asked)} />
              {session.timed && (
                <Stat label="Time" value={Logic.fmtDuration(session.elapsedMs)} accent />
              )}
            </View>
          </>
        )}
        <View style={styles.row}>
          <Pressable
            onPress={toMenu}
            style={(state: PressableStateCallbackType) => [
              styles.btnSecondary,
              state.focused && styles.btnSecondaryFocused,
            ]}
          >
            <Text style={styles.btnTextSecondary}>Menu</Text>
          </Pressable>
          <Pressable
            onPress={playAgain}
            hasTVPreferredFocus
            style={(state: PressableStateCallbackType) => [
              styles.btnPrimary,
              state.focused && styles.btnPrimaryFocused,
            ]}
          >
            <Text style={styles.btnTextPrimary}>Play again</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Stat({
  label,
  value,
  accent,
  good,
}: {
  label: string;
  value: string;
  accent?: boolean;
  good?: boolean;
}) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, accent && styles.statAccent, good && styles.statGood]}>
        {value}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" },
  card: {
    width: 900,
    backgroundColor: theme.parchment,
    borderRadius: 20,
    paddingVertical: 48,
    paddingHorizontal: 56,
    alignItems: "center",
  },
  title: { color: theme.ink, fontSize: 48, fontFamily: "Georgia", fontWeight: "700" },
  sub: { color: theme.inkDim, fontSize: 22, fontFamily: "Georgia", marginTop: 10 },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    marginTop: 36,
    marginBottom: 44,
    justifyContent: "center",
  },
  stat: {
    backgroundColor: theme.parchmentInset,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.stroke,
    paddingVertical: 20,
    paddingHorizontal: 28,
    alignItems: "center",
    minWidth: 140,
  },
  statValue: { color: theme.ink, fontSize: 38, fontFamily: "Georgia", fontWeight: "700" },
  statAccent: { color: theme.brass },
  statGood: { color: theme.good },
  statLabel: {
    color: theme.inkFaint,
    fontSize: 15,
    letterSpacing: 1,
    marginTop: 4,
    fontVariant: ["small-caps"],
  },
  row: { flexDirection: "row", gap: 20 },
  btnPrimary: {
    backgroundColor: theme.brass,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "transparent",
    paddingVertical: 16,
    paddingHorizontal: 44,
  },
  btnPrimaryFocused: { borderColor: theme.ink, transform: [{ scale: 1.08 }] },
  btnSecondary: {
    backgroundColor: theme.parchmentInset,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "transparent",
    paddingVertical: 16,
    paddingHorizontal: 36,
  },
  btnSecondaryFocused: { borderColor: theme.brass, transform: [{ scale: 1.08 }] },
  btnTextPrimary: { color: theme.cream, fontSize: 24, fontWeight: "700" },
  btnTextSecondary: { color: theme.ink, fontSize: 24, fontWeight: "700" },
});
