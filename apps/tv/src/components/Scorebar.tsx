import { View, Text, StyleSheet } from "react-native";
import { Logic, useQuizStore } from "@geobean/core";
import { theme } from "../theme";
import { fonts } from "../fonts";

/**
 * Top-strip HUD for the map quiz: question counter, score, streak and elapsed
 * clock, read off the live `session` (asked/total/score/streak) plus the
 * store's `elapsedMs` stopwatch. tvOS render of web's #scorebar — same four
 * pills, parchment values on translucent navy, serif. Non-focusable: the remote
 * never lands here.
 */
export function Scorebar() {
  const session = useQuizStore((s) => s.session);
  const elapsedMs = useQuizStore((s) => s.elapsedMs);

  if (!session) return null;

  const total = Number.isFinite(session.total) ? String(session.total) : "∞";

  return (
    <View style={styles.bar} pointerEvents="none">
      <Pill label="Question" value={`${session.asked} / ${total}`} />
      <Pill label="Score" value={String(session.score)} />
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
