import { useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  type PressableStateCallbackType,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BOX_COLORS, DataLayer, Logic, useAtlasStore } from "@geobean/core";
import type { RootStackParamList } from "../navigation";
import { theme } from "../theme";
import { fonts } from "../fonts";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * 10-foot progress screen — the tvOS port of the top of web's StatsDashboard
 * (apps/web/components/StatsDashboard.tsx). Reads the durable atlas store:
 * headline KPIs (answered / accuracy / best streak / mastered), the Leitner box
 * distribution coloured by BOX_COLORS, and a weakest-10 list ranked by
 * Logic.itemWeight (the same weight the scheduler uses to resurface items).
 *
 * The sparklines and accuracy-by-region bars from web are dropped — the box
 * bars plus the weakest list carry the "what should I drill" story at couch
 * distance without a charting dependency. Reset is double-confirmed because the
 * remote makes a stray click cheap and resetProgress is irreversible.
 */
export function StatsScreen() {
  const nav = useNavigation<Nav>();
  const stats = useAtlasStore((s) => s.stats);
  const leitner = useAtlasStore((s) => s.leitner);
  const resetProgress = useAtlasStore((s) => s.resetProgress);
  const [confirming, setConfirming] = useState(false);

  const { boxCounts, mastered, weak, accuracy } = useMemo(() => {
    // Collapse "id:mode" keys to one box per country (its strongest mode), the
    // same rollup web's dashboard does for the mastery boxes.
    const itemBox: Record<string, number> = {};
    for (const k in leitner) {
      const id = k.split(":")[0];
      itemBox[id] = Math.max(itemBox[id] || 1, leitner[k].box);
    }
    const boxCounts = [0, 0, 0, 0, 0];
    Object.values(itemBox).forEach((b) => boxCounts[b - 1]++);
    const mastered = Object.values(itemBox).filter((b) => b >= 5).length;

    // Weakest items by the live scheduler weight (higher = more overdue / missed).
    // Weight is per "id:mode"; keep the worst entry per country so one country
    // can't fill the list across modes.
    const worst: Record<string, number> = {};
    const now = Date.now();
    for (const k in leitner) {
      const id = k.split(":")[0];
      const w = Logic.itemWeight(leitner[k], now);
      if (w > (worst[id] ?? -Infinity)) worst[id] = w;
    }
    const weak = Object.entries(worst)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => DataLayer.byCcn3.get(id) || DataLayer.byCca3.get(id))
      .filter((c): c is NonNullable<typeof c> => Boolean(c));

    const accuracy = stats.answered ? Math.round((stats.correct / stats.answered) * 100) : 0;
    return { boxCounts, mastered, weak, accuracy };
  }, [leitner, stats.answered, stats.correct]);

  const maxBox = Math.max(1, ...boxCounts);

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Your progress</Text>
      <Text style={styles.subtitle}>
        {stats.answered
          ? `${stats.answered} questions answered all-time`
          : "No questions answered yet — start a session!"}
      </Text>

      <View style={styles.kpiRow}>
        <Kpi label="Answered" value={String(stats.answered)} accent />
        <Kpi label="Accuracy" value={`${accuracy}%`} good />
        <Kpi label="Best streak" value={String(stats.bestStreak)} warn />
        <Kpi label="Mastered" value={String(mastered)} />
      </View>

      <Text style={styles.sectionTitle}>Mastery (Leitner boxes)</Text>
      <View style={styles.boxRow}>
        {boxCounts.map((count, i) => (
          <View key={i} style={styles.boxCol}>
            <Text style={[styles.boxCount, { color: BOX_COLORS[i] }]}>{count}</Text>
            <View style={styles.boxTrack}>
              <View
                style={[
                  styles.boxFill,
                  { height: `${(count / maxBox) * 100}%`, backgroundColor: BOX_COLORS[i] },
                ]}
              />
            </View>
            <Text style={styles.boxLabel}>Box {i + 1}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Weakest countries</Text>
      <View style={styles.weakGrid}>
        {weak.length ? (
          weak.map((c) => (
            <View key={c.id} style={styles.weakItem}>
              <Text style={styles.weakFlag}>{c.flagEmoji || "🏳️"}</Text>
              <Text style={styles.weakName} numberOfLines={1}>
                {c.name}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.emptyNote}>No data yet — play a round to see your weak spots.</Text>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable
          onPress={() => nav.navigate("Menu")}
          hasTVPreferredFocus
          style={(s: PressableStateCallbackType) => [
            styles.btnSecondary,
            s.focused && styles.btnSecondaryFocused,
          ]}
        >
          <Text style={styles.btnTextSecondary}>Back to menu</Text>
        </Pressable>

        {confirming ? (
          <View style={styles.confirmRow}>
            <Text style={styles.confirmText}>Erase all progress?</Text>
            <Pressable
              onPress={() => {
                resetProgress();
                setConfirming(false);
              }}
              style={(s: PressableStateCallbackType) => [
                styles.btnDanger,
                s.focused && styles.btnDangerFocused,
              ]}
            >
              <Text style={styles.btnTextDanger}>Yes, reset</Text>
            </Pressable>
            <Pressable
              onPress={() => setConfirming(false)}
              style={(s: PressableStateCallbackType) => [
                styles.btnSecondary,
                s.focused && styles.btnSecondaryFocused,
              ]}
            >
              <Text style={styles.btnTextSecondary}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => setConfirming(true)}
            style={(s: PressableStateCallbackType) => [
              styles.btnReset,
              s.focused && styles.btnResetFocused,
            ]}
          >
            <Text style={styles.btnTextReset}>Reset progress…</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

function Kpi({
  label,
  value,
  accent,
  good,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  good?: boolean;
  warn?: boolean;
}) {
  return (
    <View style={styles.kpi}>
      <Text
        style={[
          styles.kpiValue,
          accent && { color: theme.brass },
          good && { color: theme.good },
          warn && { color: theme.oxblood },
        ]}
      >
        {value}
      </Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { alignItems: "center", paddingVertical: 56, paddingHorizontal: 64 },
  title: { color: theme.cream, fontSize: 56, fontFamily: fonts.displaySemi },
  subtitle: { color: theme.creamDim, fontSize: 22, fontFamily: fonts.body, marginBottom: 36 },
  sectionTitle: {
    alignSelf: "flex-start",
    color: theme.cream,
    fontSize: 22,
    fontFamily: fonts.displaySemi,
    letterSpacing: 1,
    marginTop: 40,
    marginBottom: 18,
  },

  kpiRow: { flexDirection: "row", gap: 20, flexWrap: "wrap", justifyContent: "center" },
  kpi: {
    backgroundColor: theme.parchment,
    borderRadius: 14,
    paddingVertical: 24,
    paddingHorizontal: 40,
    alignItems: "center",
    minWidth: 200,
  },
  kpiValue: { color: theme.ink, fontSize: 52, fontFamily: fonts.displaySemi },
  kpiLabel: {
    color: theme.inkFaint,
    fontSize: 15,
    letterSpacing: 1.5,
    marginTop: 6,
    fontVariant: ["small-caps"],
    fontFamily: fonts.bodyMedium,
  },

  boxRow: { flexDirection: "row", gap: 24, alignSelf: "flex-start", alignItems: "flex-end" },
  boxCol: { alignItems: "center", width: 140 },
  boxCount: { fontSize: 34, fontFamily: fonts.displaySemi, marginBottom: 8 },
  boxTrack: {
    width: 64,
    height: 160,
    backgroundColor: theme.bg2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(199, 180, 137, 0.2)",
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  boxFill: { width: "100%", borderRadius: 6, minHeight: 4 },
  boxLabel: { color: theme.creamDim, fontSize: 16, fontFamily: fonts.body, marginTop: 10 },

  weakGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    alignSelf: "flex-start",
    maxWidth: 1120,
  },
  weakItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: theme.parchmentInset,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    width: 340,
  },
  weakFlag: { fontSize: 34 },
  weakName: { color: theme.ink, fontSize: 22, fontFamily: fonts.bodyMedium, flexShrink: 1 },
  emptyNote: { color: theme.creamDim, fontSize: 20, fontFamily: fonts.body, fontStyle: "italic" },

  actions: { flexDirection: "row", gap: 20, marginTop: 52, alignItems: "center", flexWrap: "wrap" },
  confirmRow: { flexDirection: "row", gap: 16, alignItems: "center" },
  confirmText: { color: theme.cream, fontSize: 22, fontFamily: fonts.body },
  btnSecondary: {
    backgroundColor: theme.parchmentInset,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "transparent",
    paddingVertical: 16,
    paddingHorizontal: 36,
  },
  btnSecondaryFocused: { borderColor: theme.brass, transform: [{ scale: 1.08 }] },
  btnTextSecondary: { color: theme.ink, fontSize: 24, fontFamily: fonts.bodySemi },
  btnReset: {
    backgroundColor: "transparent",
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "transparent",
    paddingVertical: 16,
    paddingHorizontal: 36,
  },
  btnResetFocused: { borderColor: theme.oxblood, transform: [{ scale: 1.08 }] },
  btnTextReset: { color: theme.creamDim, fontSize: 22, fontFamily: fonts.body },
  btnDanger: {
    backgroundColor: theme.oxblood,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "transparent",
    paddingVertical: 16,
    paddingHorizontal: 36,
  },
  btnDangerFocused: { borderColor: theme.cream, transform: [{ scale: 1.08 }] },
  btnTextDanger: { color: theme.cream, fontSize: 24, fontFamily: fonts.bodySemi },
});
