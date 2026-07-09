import { useState } from "react";
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
import { useAtlasStore, toast } from "@geobean/core";
import type { RootStackParamList } from "../navigation";
import { theme } from "../theme";
import { fonts } from "../fonts";

type Nav = NativeStackNavigationProp<RootStackParamList>;

// The quiz families, each a card on the landing — copied from web's CARDS
// (apps/web/app/page.tsx). Build/Puzzle is present but disabled: the drag builder
// isn't implemented on TV, so it reads as "coming soon" rather than being hidden,
// keeping the three-chapter layout intentional.
type CardType = "map" | "expert" | "build";
const CARDS: {
  type: CardType;
  icon: string;
  title: string;
  tag: string;
  blurb: string;
  disabled?: boolean;
}[] = [
  {
    type: "map",
    icon: "🗺️",
    title: "Map identification",
    tag: "Find it · name it",
    blurb: "Pin a country on the world map, or name the one that's glowing.",
  },
  {
    type: "expert",
    icon: "🚩",
    title: "Quiz",
    tag: "Flags · capitals · borders",
    blurb: "Rapid-fire flags, capitals, and framed borders. No world map — just recall.",
  },
  {
    type: "build",
    icon: "🧩",
    title: "Puzzle",
    tag: "Build a continent",
    blurb: "Drag every country into place and rebuild a continent.",
    disabled: true,
  },
];

/**
 * The intro / landing screen — the tvOS render of web's menu landing
 * (apps/web/app/page.tsx, the `selected === null` state). A bean hero, the
 * "GeoBean" wordmark in the display serif, an italic tagline, then the three
 * numbered chapter cards. Selecting Map or Quiz pushes the per-family
 * ConfigScreen; Puzzle is disabled (Build is web-only). A bottom utility row
 * mirrors web's footer: Stats / Export / Import / Reset / sound.
 *
 * The bean mark on web is an SVG (public/geobean.svg); react-native-svg isn't a
 * dependency of the TV app, so the hero uses the 🫘 emoji — the closest
 * couch-distance stand-in without pulling in a native module + pod install.
 *
 * FOCUS mode only (no cursor): every card and footer button is a focusable
 * Pressable with a brass focus ring + scale. The first card takes preferred
 * focus. This is the root screen, so the Menu/Back button keeps its default
 * tvOS behaviour (exit) — useMenuButtonBack is deliberately not mounted here.
 */
export function MenuScreen() {
  const nav = useNavigation<Nav>();
  const settings = useAtlasStore((s) => s.settings);
  const setSettings = useAtlasStore((s) => s.setSettings);
  const exportState = useAtlasStore((s) => s.exportState);
  const resetProgress = useAtlasStore((s) => s.resetProgress);
  const hydrated = useAtlasStore((s) => s._hasHydrated);

  const [confirmReset, setConfirmReset] = useState(false);

  const openCard = (type: CardType) => {
    if (type === "build") return; // disabled — no TV builder
    nav.navigate("Config", { family: type });
  };

  // Export: tvOS has no download/file-save affordance, so we surface the JSON
  // length via a toast rather than pretending to write a file. Import likewise
  // has no file picker on TV — both are honestly noted, full round-trip lives on
  // the web app. (Reset, the destructive one, IS wired.)
  const doExport = () => {
    const json = exportState();
    toast(`Export is on the web app — ${json.length} chars of progress here.`, "");
  };
  const doImport = () => {
    toast("Import your progress from the web app.", "");
  };
  const doReset = () => {
    resetProgress();
    setConfirmReset(false);
    toast("Progress reset.", "good");
  };
  const toggleSound = () => setSettings({ sound: !settings.sound });

  const soundOn = hydrated && settings.sound;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroLogo}>🫘</Text>
        <Text style={styles.title}>GeoBean</Text>
        <Text style={styles.tagline}>Compulsive geography.</Text>
      </View>

      <View style={styles.cards}>
        {CARDS.map((c, i) => (
          <QuizCard
            key={c.type}
            index={i}
            icon={c.icon}
            title={c.title}
            tag={c.tag}
            blurb={c.blurb}
            disabled={c.disabled}
            preferred={i === 0}
            onPress={() => openCard(c.type)}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <FooterButton label="📊 Stats" onPress={() => nav.navigate("Stats")} />
        <FooterButton label="Export" onPress={doExport} />
        <FooterButton label="Import" onPress={doImport} />
        {confirmReset ? (
          <>
            <FooterButton label="Confirm reset" danger onPress={doReset} />
            <FooterButton label="Cancel" onPress={() => setConfirmReset(false)} />
          </>
        ) : (
          <FooterButton label="Reset" onPress={() => setConfirmReset(true)} />
        )}
        <FooterButton
          label={soundOn ? "🔊" : "🔇"}
          active={soundOn}
          onPress={toggleSound}
        />
      </View>
    </ScrollView>
  );
}

function QuizCard({
  index,
  icon,
  title,
  tag,
  blurb,
  disabled,
  preferred,
  onPress,
}: {
  index: number;
  icon: string;
  title: string;
  tag: string;
  blurb: string;
  disabled?: boolean;
  preferred?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      // A disabled card must not steal preferred focus.
      hasTVPreferredFocus={preferred && !disabled}
      style={(state: PressableStateCallbackType) => [
        styles.card,
        disabled && styles.cardDisabled,
        state.focused && !disabled && styles.cardFocused,
      ]}
    >
      <Text style={styles.cardNo} allowFontScaling={false}>
        {String(index + 1).padStart(2, "0")}
      </Text>
      <Text style={styles.cardIcon}>{icon}</Text>
      <View style={styles.cardBody}>
        <Text style={styles.cardTag}>{tag}</Text>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardBlurb}>{blurb}</Text>
        {disabled && <Text style={styles.comingSoon}>Coming soon — build it on the web</Text>}
      </View>
    </Pressable>
  );
}

function FooterButton({
  label,
  onPress,
  active,
  danger,
}: {
  label: string;
  onPress: () => void;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={(state: PressableStateCallbackType) => [
        styles.footerBtn,
        active && styles.footerBtnActive,
        danger && styles.footerBtnDanger,
        state.focused && styles.footerBtnFocused,
      ]}
    >
      <Text style={[styles.footerText, danger && styles.footerTextDanger]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 64 },

  hero: { alignItems: "center", marginBottom: 44 },
  heroLogo: { fontSize: 84, lineHeight: 96, marginBottom: 8 },
  title: {
    color: theme.cream,
    fontSize: 76,
    fontFamily: fonts.displaySemi,
    letterSpacing: -1,
  },
  tagline: {
    color: theme.creamDim,
    fontSize: 26,
    fontFamily: fonts.body,
    fontStyle: "italic",
    marginTop: 10,
  },

  cards: { width: "100%", maxWidth: 920, gap: 22 },
  card: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: 28,
    backgroundColor: theme.parchment,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.stroke,
    borderLeftWidth: 6,
    borderLeftColor: theme.brass,
    paddingVertical: 30,
    paddingHorizontal: 34,
  },
  cardFocused: {
    borderColor: theme.brass,
    borderLeftColor: theme.brass,
    transform: [{ scale: 1.03 }],
  },
  cardDisabled: { opacity: 0.5, borderLeftColor: theme.hair },
  cardNo: {
    position: "absolute",
    top: 20,
    right: 26,
    color: theme.brass,
    opacity: 0.4,
    fontSize: 40,
    fontFamily: fonts.displaySemi,
  },
  cardIcon: { fontSize: 68, lineHeight: 78 },
  cardBody: { flex: 1 },
  cardTag: {
    color: theme.forest,
    fontSize: 20,
    fontFamily: fonts.bodySemi,
    marginBottom: 4,
  },
  cardTitle: {
    color: theme.ink,
    fontSize: 40,
    fontFamily: fonts.displaySemi,
    lineHeight: 46,
  },
  cardBlurb: {
    color: theme.inkDim,
    fontSize: 21,
    fontFamily: fonts.body,
    lineHeight: 29,
    marginTop: 6,
    maxWidth: 620,
  },
  comingSoon: {
    color: theme.inkFaint,
    fontSize: 18,
    fontFamily: fonts.bodySemi,
    fontStyle: "italic",
    marginTop: 10,
  },

  footer: {
    flexDirection: "row",
    gap: 14,
    marginTop: 48,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  footerBtn: {
    backgroundColor: "rgba(237, 228, 209, 0.06)",
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "rgba(237, 228, 209, 0.22)",
    paddingVertical: 14,
    paddingHorizontal: 26,
    minWidth: 110,
    alignItems: "center",
  },
  footerBtnActive: { backgroundColor: theme.brass, borderColor: "transparent" },
  footerBtnDanger: { backgroundColor: theme.oxblood, borderColor: "transparent" },
  footerBtnFocused: { borderColor: theme.brass, transform: [{ scale: 1.06 }] },
  footerText: { color: theme.cream, fontSize: 22, fontFamily: fonts.bodySemi },
  footerTextDanger: { color: theme.cream },
});
