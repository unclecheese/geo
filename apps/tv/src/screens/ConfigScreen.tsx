import { useEffect, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  type PressableStateCallbackType,
} from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
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
import { useMenuButtonBack } from "../input/useMenuButtonBack";
import { theme } from "../theme";
import { fonts } from "../fonts";

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ConfigRoute = RouteProp<RootStackParamList, "Config">;

const MAP_MODES: ModeId[] = ["find", "name"];
const QUIZ_MODES: ModeId[] = ["capital", "flag"];
const ROUND_LENGTHS = [10, 15, 20];

// The "What to test" toggles per family, mirroring web's drill-down copy.
const MAP_TOGGLES: { id: ModeId; label: string; sub: string }[] = [
  { id: "find", label: "📍 Find on map", sub: "Pin the named country on the world map" },
  { id: "name", label: "🏷️ Name the country", sub: "Name the country that's glowing" },
];
const QUIZ_TOGGLES: { id: ModeId; label: string; sub: string }[] = [
  { id: "flag", label: "🚩 Flags", sub: "Identify the country from its flag" },
  { id: "capital", label: "🏛️ Capitals", sub: "Name each country's capital city" },
  { id: "border", label: "🧭 Borders", sub: "Name the neighbours in a framed picture (its own quiz)" },
];

/**
 * Per-family settings drill-down — the tvOS render of web's menu `selected`
 * state (apps/web/app/page.tsx). One screen parameterised by `family`:
 *   - "map"    → Find / Name toggles, Regions, Difficulty, Length, timer
 *   - "expert" → Flags / Capitals / Borders toggles, Regions, Difficulty, Length
 *
 * All settings logic is ported verbatim from the old single-screen MenuScreen —
 * the same reads/writes against `useAtlasStore`, the same region multi-select,
 * the same Start-normalise-then-navigate. On mount it coerces the mode set to
 * this family (web's openCard), so entering from a card lands on a valid
 * selection. Menu/Back pops to the intro cards.
 */
export function ConfigScreen() {
  const nav = useNavigation<Nav>();
  const { family } = useRoute<ConfigRoute>().params;
  const settings = useAtlasStore((s) => s.settings);
  const setSettings = useAtlasStore((s) => s.setSettings);
  const hydrated = useAtlasStore((s) => s._hasHydrated);

  useMenuButtonBack(() => nav.goBack());

  const regionOptions = useMemo(
    () => Array.from(new Set(DataLayer.countries.map((c) => c.region))).sort(),
    []
  );

  // Coerce the mode set to this family on entry — web's openCard patch. Runs once
  // per mount; the family param is fixed for the life of the screen.
  useEffect(() => {
    if (family === "map") {
      const keep = settings.modes.filter((m) => MAP_MODES.includes(m));
      setSettings({ modes: keep.length ? keep : ["find", "name"] });
    } else {
      // Quiz card: keep a saved border pick (exclusive); otherwise keep any
      // capital/flag, defaulting to both.
      if (settings.modes.includes("border")) setSettings({ modes: ["border"] });
      else {
        const keep = settings.modes.filter((m) => QUIZ_MODES.includes(m));
        setSettings({ modes: keep.length ? keep : ["capital", "flag"] });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [family]);

  const modeOn = (id: ModeId) => hydrated && settings.modes.includes(id);

  // Toggle a mode. Find+Name and Capital+Flag combine within their group;
  // Borders is exclusive (selecting it clears the rest, and vice versa).
  const toggleMode = (id: ModeId) => {
    if (id === "border") {
      setSettings({ modes: settings.modes.includes("border") ? ["capital"] : ["border"] });
      return;
    }
    const group = MODES[id].group;
    const set = new Set(settings.modes.filter((m) => MODES[m]?.group === group && m !== "border"));
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setSettings({ modes: set.size ? [...set] : [id] });
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

  const toggles = family === "map" ? MAP_TOGGLES : QUIZ_TOGGLES;

  // Map/Quiz require at least one mode in the family (Borders counts for Quiz).
  const noModes =
    hydrated &&
    !settings.modes.some(
      (m) => MODES[m]?.group === family || (family === "expert" && m === "border")
    );

  const start = () => {
    if (noModes) return;
    if (family === "map") {
      const keep = settings.modes.filter((m) => MODES[m].group === "map");
      setSettings({ modes: keep.length ? keep : ["find", "name"] });
      nav.navigate("MapQuiz");
      return;
    }
    // Quiz card: Borders routes to its own family; capital/flag route to expert.
    if (settings.modes.includes("border")) {
      setSettings({ modes: ["border"] });
      nav.navigate("BordersQuiz");
      return;
    }
    const keep = settings.modes.filter((m) => MODES[m].group === "expert");
    setSettings({ modes: Logic.sanitizeModes(keep.length ? keep : ["capital", "flag"]) });
    nav.navigate("ExpertQuiz");
  };

  const headIcon = family === "map" ? "🗺️" : "🚩";
  const headTitle = family === "map" ? "Map identification" : "Quiz";

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Pressable
          onPress={() => nav.goBack()}
          hasTVPreferredFocus
          style={(s: PressableStateCallbackType) => [styles.back, s.focused && styles.backFocused]}
        >
          <Text style={styles.backText}>← All quizzes</Text>
        </Pressable>

        <View style={styles.head}>
          <Text style={styles.headIcon}>{headIcon}</Text>
          <Text style={styles.headTitle}>{headTitle}</Text>
        </View>

        <Section title="What to test">
          {toggles.map((t) => (
            <ToggleRow
              key={t.id}
              label={t.label}
              sub={t.sub}
              on={modeOn(t.id)}
              onPress={() => toggleMode(t.id)}
            />
          ))}
          {noModes && <Text style={styles.hint}>Switch on at least one to start.</Text>}
        </Section>

        <Section title="Regions">
          <View style={styles.chipWrap}>
            <Chip
              label={(allRegionsOn ? "✓ " : "") + "🌍 All regions"}
              active={allRegionsOn}
              all
              onPress={() => setSettings({ regions: [] })}
            />
            {regionOptions.map((r) => (
              <Chip
                key={r}
                label={(regionOn(r) ? "✓ " : "") + r}
                active={regionOn(r)}
                onPress={() => toggleRegion(r)}
              />
            ))}
          </View>
          <Text style={styles.hint}>
            Everything&apos;s on by default. Focus a region to narrow, then add more.
          </Text>
        </Section>

        <Section title="Difficulty">
          <Seg
            options={[
              { key: "easy", label: "Easy" },
              { key: "difficult", label: "Difficult" },
            ]}
            value={hydrated ? settings.quizDifficulty : "easy"}
            onSelect={(k) => setQuizDifficulty(k as QuizDifficulty)}
          />
          <Text style={styles.hint}>Easy = multiple choice. Difficult = type the answer.</Text>
        </Section>

        <Section title="Length">
          <Seg
            options={[
              { key: "round", label: "Set number" },
              { key: "around", label: "Around the world 🌍" },
            ]}
            value={hydrated ? settings.session : "round"}
            onSelect={(k) => setSettings({ session: k as "round" | "around" })}
          />
          {settings.session === "round" && (
            <View style={styles.chipWrap}>
              {ROUND_LENGTHS.map((n) => (
                <Chip
                  key={n}
                  label={`${n} questions`}
                  active={hydrated && settings.roundLen === n}
                  onPress={() => setSettings({ roundLen: n })}
                />
              ))}
            </View>
          )}
          {settings.session === "around" && (
            <Text style={styles.hint}>
              Every country in your selection, once — the lap ends when you&apos;ve seen them all.
            </Text>
          )}
          <ToggleRow
            label="Session timer"
            sub="Times your whole run — answer at your own pace"
            on={hydrated ? settings.timed : false}
            onPress={() => setSettings({ timed: !settings.timed })}
          />
        </Section>

        <Pressable
          onPress={start}
          disabled={noModes}
          style={(s: PressableStateCallbackType) => [
            styles.start,
            noModes && styles.startDisabled,
            s.focused && !noModes && styles.startFocused,
          ]}
        >
          <Text style={styles.startText}>Start ▸</Text>
        </Pressable>
      </View>
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

// Web's `.toggle` row: label + description on the left, a brass switch on the
// right. The whole row is the focusable target (a remote can't tap a tiny track).
function ToggleRow({
  label,
  sub,
  on,
  onPress,
}: {
  label: string;
  sub: string;
  on: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={(s: PressableStateCallbackType) => [styles.toggle, s.focused && styles.toggleFocused]}
    >
      <View style={styles.toggleTextCol}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleSub}>{sub}</Text>
      </View>
      <View style={[styles.switchTrack, on && styles.switchTrackOn]}>
        <View style={[styles.switchKnob, on && styles.switchKnobOn]} />
      </View>
    </Pressable>
  );
}

function Chip({
  label,
  active,
  all,
  onPress,
}: {
  label: string;
  active: boolean;
  all?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={(s: PressableStateCallbackType) => [
        styles.chip,
        active && (all ? styles.chipAllActive : styles.chipActive),
        s.focused && styles.chipFocused,
      ]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// Web's `.seg` segmented control: a recessed track of equal-weight buttons, the
// selected one filled brass.
function Seg({
  options,
  value,
  onSelect,
}: {
  options: { key: string; label: string }[];
  value: string;
  onSelect: (key: string) => void;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => (
        <Pressable
          key={o.key}
          onPress={() => onSelect(o.key)}
          style={(s: PressableStateCallbackType) => [
            styles.segBtn,
            value === o.key && styles.segBtnOn,
            s.focused && styles.segBtnFocused,
          ]}
        >
          <Text style={[styles.segText, value === o.key && styles.segTextOn]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { alignItems: "center", paddingVertical: 56, paddingHorizontal: 64 },

  card: {
    width: "100%",
    maxWidth: 900,
    backgroundColor: theme.parchment,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.stroke,
    padding: 40,
  },

  back: { alignSelf: "flex-start", borderRadius: 8, borderWidth: 2, borderColor: "transparent", paddingVertical: 8, paddingHorizontal: 12, marginBottom: 8 },
  backFocused: { borderColor: theme.brass },
  backText: { color: theme.inkDim, fontSize: 22, fontFamily: fonts.body, fontStyle: "italic" },

  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.hair,
    paddingBottom: 18,
    marginBottom: 24,
  },
  headIcon: { fontSize: 44, lineHeight: 52 },
  headTitle: { color: theme.ink, fontSize: 44, fontFamily: fonts.displaySemi },

  section: { marginBottom: 26 },
  sectionTitle: {
    color: theme.forest,
    fontSize: 20,
    fontFamily: fonts.bodySemi,
    letterSpacing: 1,
    marginBottom: 12,
    fontVariant: ["small-caps"],
  },
  hint: {
    color: theme.inkFaint,
    fontSize: 17,
    fontFamily: fonts.body,
    fontStyle: "italic",
    marginTop: 10,
  },

  toggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  toggleFocused: { borderColor: theme.brass, backgroundColor: theme.parchment2 },
  toggleTextCol: { flex: 1 },
  toggleLabel: { color: theme.ink, fontSize: 26, fontFamily: fonts.bodySemi },
  toggleSub: { color: theme.inkFaint, fontSize: 17, fontFamily: fonts.body, fontStyle: "italic", marginTop: 2 },
  switchTrack: {
    width: 64,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.parchmentInset,
    borderWidth: 1,
    borderColor: theme.hair,
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  switchTrackOn: { backgroundColor: theme.brass, borderColor: "transparent" },
  switchKnob: { width: 28, height: 28, borderRadius: 14, backgroundColor: theme.inkFaint },
  switchKnobOn: { backgroundColor: theme.cream, alignSelf: "flex-end" },

  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 4 },
  chip: {
    backgroundColor: theme.parchment2,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.hair,
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  chipActive: { backgroundColor: theme.brass, borderColor: theme.brass },
  chipAllActive: { backgroundColor: theme.forest, borderColor: theme.forest },
  chipFocused: { borderColor: theme.brass, transform: [{ scale: 1.06 }] },
  chipText: { color: theme.ink, fontSize: 21, fontFamily: fonts.bodySemi },
  chipTextActive: { color: theme.cream },

  seg: {
    flexDirection: "row",
    backgroundColor: theme.parchmentInset,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.hair,
    padding: 4,
    gap: 4,
  },
  segBtn: { flex: 1, borderRadius: 8, borderWidth: 2, borderColor: "transparent", paddingVertical: 14, alignItems: "center" },
  segBtnOn: { backgroundColor: theme.brass },
  segBtnFocused: { borderColor: theme.brass },
  segText: { color: theme.inkDim, fontSize: 22, fontFamily: fonts.bodySemi },
  segTextOn: { color: theme.cream },

  start: {
    backgroundColor: theme.brass,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: "transparent",
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 8,
  },
  startFocused: { borderColor: theme.cream, transform: [{ scale: 1.03 }] },
  startDisabled: { opacity: 0.4 },
  startText: { color: theme.cream, fontSize: 28, fontFamily: fonts.bodySemi },
});
