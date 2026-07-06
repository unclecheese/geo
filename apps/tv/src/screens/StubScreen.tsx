import { useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { theme } from "../theme";

/**
 * Placeholder for the quiz/results/stats screens later tasks flesh out. Shows
 * the route name and a focusable "Back to menu" so navigation is drivable now,
 * and (optionally) fires the family's `start()` on mount to prove the wiring —
 * later tasks replace the body wholesale.
 */
export function StubScreen({ name, onMount }: { name: string; onMount?: () => void }) {
  const nav = useNavigation();
  useEffect(() => {
    onMount?.();
  }, [onMount]);
  return (
    <View style={styles.root}>
      <Text style={styles.title}>{name}</Text>
      <Text style={styles.sub}>Coming in a later task.</Text>
      <Pressable
        onPress={() => nav.goBack()}
        hasTVPreferredFocus
        style={({ focused }) => [styles.btn, focused && styles.btnFocused]}
      >
        <Text style={styles.btnText}>← Back to menu</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" },
  title: { color: theme.cream, fontSize: 48, fontWeight: "700", marginBottom: 12 },
  sub: { color: theme.creamDim, fontSize: 22, marginBottom: 40 },
  btn: {
    backgroundColor: theme.parchment,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  btnFocused: { borderColor: theme.brass, transform: [{ scale: 1.08 }] },
  btnText: { color: theme.ink, fontSize: 24, fontWeight: "600" },
});
