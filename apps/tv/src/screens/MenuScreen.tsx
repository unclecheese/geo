import { useMemo } from "react";
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
import {
  MODES,
  Logic,
  DataLayer,
  useAtlasStore,
  type ModeId,
  type QuizDifficulty,
} from "@geobean/core";
import type { RootStackParamList } from "../navigation";
import { theme } from "../theme";
import { fonts } from "../fonts";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// The five modes the TV menu offers, in display order. Build is web-only (drag),
// so it is deliberately absent here.
const MODE_TOGGLES: { id: ModeId; label: string }[] = [
  { id: "find", label: "Find" },
  { id: "name", label: "Name" },
  { id: "capital", label: "Capital" },
  { id: "flag", label: "Flag" },
  { id: "border", label: "Borders" },
];

const ROUND_LENGTHS = [10, 15, 20];

/**
 * 10-foot session setup, FOCUS mode only (no cursor). Reads and writes
 * `useAtlasStore` settings directly, the same durable state the web menu uses.
 * Every control is a focusable Pressable with a visible brass focus ring; the
 * three Start buttons normalise the mode set to their family (find/name → Map,
 * capital/flag → Expert, border → Borders) and navigate to it. The family
 * screen's mount effect calls the relevant store's `start()`.
 */
export function MenuScreen() {
  const nav = useNavigation<Nav>();
  const settings = useAtlasStore((s) => s.settings);
  const setSettings = useAtlasStore((s) => s.setSettings);
  const hydrated = useAtlasStore((s) => s._hasHydrated);

  // Region options come straight off the loaded dataset (LoadingGate guarantees
  // it is populated before this screen mounts).
  const regionOptions = useMemo(
    () => Array.from(new Set(DataLayer.countries.map((c) => c.region))).sort(),
    []
  );

  const modeOn = (id: ModeId) => hydrated && settings.modes.includes(id);

  // Toggle a mode. Capital+Flag combine; Find+Name combine; Borders is exclusive
  // (its own group). Selecting across groups replaces the set — sanitizeModes at
  // Start coerces any stray mix down to one group anyway.
  const toggleMode = (id: ModeId) => {
    if (id === "border") {
      setSettings({ modes: settings.modes.includes("border") ? ["capital"] : ["border"] });
      return;
    }
    const group = MODES[id].group;
    const set = new Set(
      settings.modes.filter((m) => MODES[m]?.group === group && m !== "border")
    );
    if (set.has(id)) set.delete(id);
    else set.add(id);
    const nextModes = set.size ? [...set] : [id];
    setSettings({ modes: nextModes });
  };

  // Region multi-select. Empty = whole world (every chip reads on). Narrowing
  // from "all" focuses one; a full set collapses back to [].
  const regionOn = (r: string) =>
    hydrated && (settings.regions.length === 0 || settings.regions.includes(r));
  const allRegionsOn =
    hydrated && (settings.regions.length === 0 || settings.regions.length === regionOptions.length);

  const toggleRegion = (region: string) => {
    let next: string[];
    if (settings.regions.length === 0) next = [region];
    else if (settings.regions.includes(region)) next = settings.regions.filter((r) => r !== region);
    else next = [...settings.regions, region];
    if (next.length === 0 || next.length === regionOptions.length) next = [];
    setSettings({ regions: next });
  };

  const setQuizDifficulty = (d: QuizDifficulty) => setSettings({ quizDifficulty: d });

  // Normalise the mode set to the family's canonical selection, then navigate.
  const startMap = () => {
    const keep = settings.modes.filter((m) => MODES[m].group === "map");
    setSettings({ modes: keep.length ? keep : ["find", "name"] });
    nav.navigate("MapQuiz");
  };
  const startExpert = () => {
    // Borders lives on the Expert card in web; if it's the picked mode, route to
    // the Borders family instead. sanitizeModes coerces any residual mix.
    if (settings.modes.includes("border")) {
      setSettings({ modes: ["border"] });
      nav.navigate("BordersQuiz");
      return;
    }
    const keep = settings.modes.filter((m) => MODES[m].group === "expert");
    setSettings({ modes: Logic.sanitizeModes(keep.length ? keep : ["capital", "flag"]) });
    nav.navigate("ExpertQuiz");
  };
  const startBorders = () => {
    setSettings({ modes: ["border"] });
    nav.navigate("BordersQuiz");
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>GeoBean</Text>
      <Text style={styles.subtitle}>Compulsive geography.</Text>

      <Section title="What to test">
        <View style={styles.segRow}>
          {MODE_TOGGLES.map((m, i) => (
            <Chip
              key={m.id}
              label={m.label}
              active={modeOn(m.id)}
              onPress={() => toggleMode(m.id)}
              preferred={i === 0}
            />
          ))}
        </View>
      </Section>

      <Section title="Regions">
        <View style={styles.segRow}>
          <Chip label="🌍 All" active={allRegionsOn} onPress={() => setSettings({ regions: [] })} />
          {regionOptions.map((r) => (
            <Chip key={r} label={r} active={regionOn(r)} onPress={() => toggleRegion(r)} />
          ))}
        </View>
      </Section>

      <Section title="Difficulty">
        <View style={styles.segRow}>
          <Chip
            label="Easy"
            active={hydrated && settings.quizDifficulty === "easy"}
            onPress={() => setQuizDifficulty("easy")}
          />
          <Chip
            label="Difficult"
            active={hydrated && settings.quizDifficulty === "difficult"}
            onPress={() => setQuizDifficulty("difficult")}
          />
        </View>
        <Text style={styles.hint}>Easy = multiple choice. Difficult = type the answer.</Text>
      </Section>

      <Section title="Length">
        <View style={styles.segRow}>
          <Chip
            label="Around the world 🌍"
            active={hydrated && settings.session === "around"}
            onPress={() => setSettings({ session: "around" })}
          />
          {ROUND_LENGTHS.map((n) => (
            <Chip
              key={n}
              label={String(n)}
              active={hydrated && settings.session === "round" && settings.roundLen === n}
              onPress={() => setSettings({ session: "round", roundLen: n })}
            />
          ))}
        </View>
      </Section>

      <Section title="Start">
        <View style={styles.segRow}>
          <StartButton label="Map ▸" onPress={startMap} />
          <StartButton label="Expert ▸" onPress={startExpert} />
          <StartButton label="Borders ▸" onPress={startBorders} />
        </View>
      </Section>

      <Section title="Progress">
        <View style={styles.segRow}>
          <Chip label="Your progress ▸" active={false} onPress={() => nav.navigate("Stats")} />
        </View>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
  preferred,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  preferred?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hasTVPreferredFocus={preferred}
      style={(state: PressableStateCallbackType) => [
        styles.chip,
        active && styles.chipActive,
        state.focused && styles.chipFocused,
        disabled && styles.chipDisabled,
      ]}
    >
      <Text
        style={[styles.chipText, active && styles.chipTextActive, disabled && styles.chipTextDisabled]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StartButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={(state: PressableStateCallbackType) => [
        styles.start,
        state.focused && styles.startFocused,
      ]}
    >
      <Text style={styles.startText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { alignItems: "center", paddingVertical: 56, paddingHorizontal: 64 },
  title: { color: theme.cream, fontSize: 64, fontFamily: fonts.displaySemi },
  subtitle: { color: theme.creamDim, fontSize: 24, fontFamily: fonts.body, marginBottom: 40 },
  section: { width: "100%", maxWidth: 1100, marginBottom: 32 },
  sectionTitle: {
    color: theme.cream,
    fontSize: 20,
    fontFamily: fonts.displaySemi,
    letterSpacing: 1,
    marginBottom: 14,
    fontVariant: ["small-caps"],
  },
  segRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  chip: {
    backgroundColor: theme.parchmentInset,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 22,
  },
  chipActive: { backgroundColor: theme.parchment2, borderColor: theme.forest },
  chipFocused: { borderColor: theme.brass, transform: [{ scale: 1.08 }] },
  chipText: { color: theme.inkDim, fontSize: 22, fontFamily: fonts.bodySemi },
  chipTextActive: { color: theme.ink },
  chipDisabled: { opacity: 0.4 },
  chipTextDisabled: { color: theme.inkFaint },
  hint: { color: theme.creamDim, fontSize: 16, marginTop: 10, fontStyle: "italic" },
  start: {
    backgroundColor: theme.brass,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "transparent",
    paddingVertical: 16,
    paddingHorizontal: 40,
  },
  startFocused: { borderColor: theme.cream, transform: [{ scale: 1.08 }] },
  startText: { color: theme.cream, fontSize: 26, fontFamily: fonts.bodySemi },
});
