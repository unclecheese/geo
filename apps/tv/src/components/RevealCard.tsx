import { View, Text, Pressable, StyleSheet, type PressableStateCallbackType } from "react-native";
import { Logic, type RevealState } from "@geobean/core";
import { theme } from "../theme";
import { fonts } from "../fonts";

/**
 * Post-grade feedback overlay for the map quiz — the FOCUS-mode counterpart to
 * web's <Reveal>. Shows the verdict, country + capital · subregion, and a meta
 * line (region, border count, time), lifted from web's Reveal copy. Two
 * focusable buttons: Next (preferred focus, so the focus engine lands on it the
 * instant the reveal appears and Select advances) and End round. While this is
 * mounted the screen's cursorMode is false, so the remote drives focus here
 * instead of the map cursor.
 */
export function RevealCard({
  reveal,
  onNext,
  onEnd,
}: {
  reveal: RevealState;
  onNext: () => void;
  onEnd: () => void;
}) {
  const { item, correct, ms } = reveal;
  const meta: string[] = [`Region: ${item.region}`];
  if (item.neighbours.length) meta.push(`Borders: ${item.neighbours.length}`);
  meta.push(`Time: ${(ms / 1000).toFixed(1)}s`);

  return (
    <View style={styles.backdrop}>
      <View style={[styles.card, { borderTopColor: correct ? theme.good : theme.bad }]}>
        <Text style={[styles.verdict, { color: correct ? theme.good : theme.bad }]}>
          {correct ? "✓ Correct" : "✕ Missed"}
        </Text>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.cap}>
          Capital: {item.capital || "—"} · {item.subregion || item.region}
        </Text>
        <Text style={styles.meta}>{meta.join("   ·   ")}</Text>

        <View style={styles.row}>
          <Button label="End round" onPress={onEnd} />
          <Button label="Next ▸" onPress={onNext} preferred />
        </View>
      </View>
    </View>
  );
}

function Button({
  label,
  onPress,
  preferred,
}: {
  label: string;
  onPress: () => void;
  preferred?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hasTVPreferredFocus={preferred}
      style={(state: PressableStateCallbackType) => [
        preferred ? styles.btnPrimary : styles.btnSecondary,
        state.focused && (preferred ? styles.btnPrimaryFocused : styles.btnSecondaryFocused),
      ]}
    >
      <Text style={[styles.btnText, preferred ? styles.btnTextPrimary : styles.btnTextSecondary]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6, 15, 27, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  card: {
    width: 760,
    backgroundColor: theme.parchment,
    borderRadius: 16,
    borderTopWidth: 6,
    paddingVertical: 36,
    paddingHorizontal: 48,
    alignItems: "center",
  },
  verdict: { fontSize: 26, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
  name: { color: theme.ink, fontSize: 52, fontFamily: fonts.displaySemi },
  cap: { color: theme.inkDim, fontSize: 24, fontFamily: fonts.body, marginTop: 6 },
  meta: { color: theme.inkFaint, fontSize: 18, marginTop: 14 },
  row: { flexDirection: "row", gap: 20, marginTop: 32 },
  btnPrimary: {
    backgroundColor: theme.brass,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 44,
  },
  btnPrimaryFocused: { borderColor: theme.ink, transform: [{ scale: 1.08 }] },
  btnSecondary: {
    backgroundColor: theme.parchmentInset,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  btnSecondaryFocused: { borderColor: theme.brass, transform: [{ scale: 1.08 }] },
  btnText: { fontSize: 24, fontWeight: "700" },
  btnTextPrimary: { color: theme.cream },
  btnTextSecondary: { color: theme.ink },
});
