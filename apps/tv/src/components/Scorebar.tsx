import { View, Text, StyleSheet } from "react-native";
import { Logic, useAtlasStore, useQuizStore } from "@geobean/core";
import { theme } from "../theme";
import { fonts } from "../fonts";

/**
 * Top-strip HUD: score, all-time accuracy, streak and elapsed clock — the tvOS
 * render of web's #scorebar (apps/web/components/Scorebar.tsx). Score & streak
 * come from the live `session`; accuracy is all-time from persisted stats; the
 * clock is the store's `elapsedMs`. The question counter is NOT here — it lives
 * in the card's `.q-top`, matching web's split. Non-focusable: the remote never
 * lands here.
 */
export function Scorebar() {
  const session = useQuizStore((s) => s.session);
  const elapsedMs = useQuizStore((s) => s.elapsedMs);
  const stats = useAtlasStore((s) => s.stats);

  if (!session) return null;

  const acc = stats.answered ? Math.round((stats.correct / stats.answered) * 100) + "%" : "—";

  return (
    <View style={styles.bar} pointerEvents="none">
      <Pill label="Score" value={String(session.score)} />
      <Pill label="Accuracy" value={acc} />
      <Pill label="Streak" value={String(session.streak)} accent />
      <Pill label="Time" value={Logic.fmtDuration(elapsedMs)} />
    </View>
  );
}

function Pill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.pill}>
      <Text style={[styles.value, accent && styles.valueAccent]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    top: 40,
    right: 56,
    flexDirection: "row",
    gap: 14,
    zIndex: 20,
  },
  pill: {
    backgroundColor: "rgba(14, 31, 51, 0.82)",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(199, 180, 137, 0.35)",
    paddingVertical: 10,
    paddingHorizontal: 20,
    alignItems: "center",
    minWidth: 92,
  },
  value: { color: theme.cream, fontSize: 30, fontFamily: fonts.displaySemi },
  valueAccent: { color: theme.brass },
  label: {
    color: theme.creamDim,
    fontSize: 14,
    letterSpacing: 1,
    marginTop: 2,
    fontVariant: ["small-caps"],
    fontFamily: fonts.bodyMedium,
  },
});
