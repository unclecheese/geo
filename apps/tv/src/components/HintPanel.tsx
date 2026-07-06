import { View, Text, StyleSheet } from "react-native";
import type { Country } from "@geobean/core";
import { theme } from "../theme";

/**
 * Bottom-left find-mode hint stack. Escalates with `hintLevel` (Play/Pause
 * cycles it 0→3 in the store): region → subregion → border countries. Copy is
 * lifted verbatim from web's map page (`apps/web/app/map/page.tsx` findHints)
 * so the two clients read identically. Non-focusable.
 */
export function HintPanel({ item, hintLevel }: { item: Country; hintLevel: number }) {
  const hints: string[] = [];
  if (hintLevel >= 1) hints.push(`Region: ${item.region}`);
  if (hintLevel >= 2 && item.subregion) hints.push(`Subregion: ${item.subregion}`);
  if (hintLevel >= 3) {
    const names = item.neighbours.map((n) => n.name);
    hints.push(names.length ? `Borders: ${names.join(", ")}` : "Island — no land borders");
  }

  if (!hints.length) return null;

  return (
    <View style={styles.panel} pointerEvents="none">
      <Text style={styles.head}>Hints</Text>
      {hints.map((h) => (
        <Text key={h} style={styles.hint}>
          {h}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    left: 56,
    bottom: 56,
    maxWidth: 620,
    backgroundColor: "rgba(14, 31, 51, 0.86)",
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: theme.brass,
    paddingVertical: 18,
    paddingHorizontal: 24,
    zIndex: 20,
  },
  head: {
    color: theme.brass,
    fontSize: 15,
    letterSpacing: 1.5,
    marginBottom: 8,
    fontVariant: ["small-caps"],
    fontWeight: "700",
  },
  hint: { color: theme.cream, fontSize: 24, fontFamily: "Georgia", marginTop: 4 },
});
