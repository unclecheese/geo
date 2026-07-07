import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  type PressableStateCallbackType,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Logic, DataLayer, suggest, useBordersStore, type Country } from "@geobean/core";
import type { RootStackParamList } from "../navigation";
import { TvFrame } from "../map/TvFrame";
import { theme } from "../theme";

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Borders quiz — frame a country, name every numbered neighbour. Fully mapless
 * (the store touches no MapView; TvFrame is a static Skia picture), so this
 * screen mounts no map cursor hook and drives focus entirely through native
 * Pressables. The tvOS port of web's /borders page (apps/web/app/borders/page.tsx):
 * easy = match candidate names to badge numbers, difficult = type each. The store
 * owns all grading; on `finished` we return to Menu (the shared Results screen is
 * bound to the quiz store, so it can't render a borders session).
 */
export function BordersQuizScreen() {
  const nav = useNavigation<Nav>();

  const session = useBordersStore((s) => s.session);
  const elapsedMs = useBordersStore((s) => s.elapsedMs);
  const target = useBordersStore((s) => s.target);
  const shown = useBordersStore((s) => s.shown);
  const candidates = useBordersStore((s) => s.candidates);
  const easy = useBordersStore((s) => s.easy);
  const assign = useBordersStore((s) => s.assign);
  const typed = useBordersStore((s) => s.typed);
  const answered = useBordersStore((s) => s.answered);
  const reveal = useBordersStore((s) => s.reveal);
  const finished = useBordersStore((s) => s.finished);

  useEffect(() => {
    useBordersStore.getState().start();
    return () => {
      useBordersStore.getState().quit();
    };
  }, []);

  useEffect(() => {
    if (finished) nav.navigate("Menu");
  }, [finished, nav]);

  const nums = shown.map((_, i) => i + 1); // badge numbers 1..n

  return (
    <View style={styles.root}>
      <BordersScorebar
        asked={session?.asked ?? 0}
        total={session?.total ?? 0}
        score={session?.score ?? 0}
        streak={session?.streak ?? 0}
        elapsedMs={elapsedMs}
      />

      {target && (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.promptLabel}>Name the countries bordering</Text>
          <Text style={styles.promptName}>{target.name}</Text>
          <Text style={styles.promptSub}>
            {easy
              ? "Select a name, then its number in the picture. Some don't border it — leave those unset."
              : "Type the country at each number."}
          </Text>

          <View style={styles.frameWrap}>
            <TvFrame key={target.id} target={target} shown={shown} />
          </View>

          {easy && !answered && (
            <EasyMatch candidates={candidates} nums={nums} assign={assign} />
          )}

          {!easy && !answered && <DifficultRows nums={nums} typed={typed} />}

          {answered && reveal && <BordersReveal reveal={reveal} />}
        </ScrollView>
      )}
    </View>
  );
}

/* ---- Easy: match candidate names to badge numbers -------------------------- */

// Two-step assign: focus lands on a candidate name (Select toggles it "picked"),
// then the badge-number chips below assign the picked candidate to that number.
// Mirrors web's per-row number strip, restructured for a single focus path: on TV
// you can't sensibly focus a whole row of tiny chips per candidate, so the picked
// candidate is the implicit row and the shared chip strip does the assigning.
function EasyMatch({
  candidates,
  nums,
  assign,
}: {
  candidates: Country[];
  nums: number[];
  assign: Record<string, number | null>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const setAssign = useBordersStore((s) => s.setAssign);
  const submit = useBordersStore((s) => s.submit);

  const assignNum = (num: number) => {
    if (!picked) return;
    setAssign(picked, assign[picked] === num ? null : num);
  };

  return (
    <View style={styles.easyWrap}>
      <View style={styles.candGrid}>
        {candidates.map((c, i) => {
          const num = assign[c.id];
          const isPicked = picked === c.id;
          return (
            <Pressable
              key={c.id}
              onPress={() => setPicked(isPicked ? null : c.id)}
              hasTVPreferredFocus={i === 0}
              style={(state: PressableStateCallbackType) => [
                styles.cand,
                num != null && styles.candAssigned,
                isPicked && styles.candPicked,
                state.focused && styles.candFocused,
              ]}
            >
              {num != null && <Text style={styles.candBadge}>{num}</Text>}
              <Text style={[styles.candText, num != null && styles.candTextAssigned]}>{c.name}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.hint}>
        {picked
          ? "Now pick this country's number — or its number again to clear it."
          : "Select a country name above."}
      </Text>

      <View style={styles.numRow}>
        {nums.map((num) => {
          const on = picked != null && assign[picked] === num;
          return (
            <Pressable
              key={num}
              disabled={picked == null}
              onPress={() => assignNum(num)}
              style={(state: PressableStateCallbackType) => [
                styles.numChip,
                on && styles.numChipOn,
                picked == null && styles.numChipDisabled,
                state.focused && picked != null && styles.numChipFocused,
              ]}
            >
              <Text style={[styles.numChipText, on && styles.numChipTextOn]}>{num}</Text>
            </Pressable>
          );
        })}
      </View>

      <SubmitButton onPress={submit} />
    </View>
  );
}

/* ---- Difficult: one typed row per badge number ----------------------------- */

function DifficultRows({ nums, typed }: { nums: number[]; typed: Record<number, string> }) {
  const submit = useBordersStore((s) => s.submit);
  return (
    <View style={styles.blanksWrap}>
      {nums.map((num) => (
        <BlankRow key={num} num={num} value={typed[num] || ""} preferred={num === 1} />
      ))}
      <SubmitButton onPress={submit} />
    </View>
  );
}

// A typed row: number badge + TextInput + a re-queried suggestion strip, each
// suggestion writing its own name into the row. Mirrors web's per-blank
// BlankInput, using the shared core `suggest` ranker (matchAnswer is forgiving on
// case/accents/typos so dictation-shaped input still grades).
function BlankRow({ num, value, preferred }: { num: number; value: string; preferred: boolean }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const setTyped = useBordersStore((s) => s.setTyped);

  const write = (v: string) => {
    setText(v);
    setTyped(num, v);
  };

  const items = focused ? suggest(text, DataLayer.countries, { limit: 4 }) : [];

  return (
    <View style={styles.blankRow}>
      <View style={styles.blankNum}>
        <Text style={styles.blankNumText}>{num}</Text>
      </View>
      <View style={styles.blankBody}>
        <TextInput
          style={styles.blankInput}
          value={text}
          onChangeText={write}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Type a country…"
          placeholderTextColor={theme.inkFaint}
          autoCorrect={false}
          autoCapitalize="words"
          returnKeyType="done"
          {...(preferred ? { hasTVPreferredFocus: true } : {})}
        />
        {items.length > 0 && (
          <View style={styles.suggestRow}>
            {items.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => write(c.name)}
                style={(state: PressableStateCallbackType) => [
                  styles.suggest,
                  state.focused && styles.suggestFocused,
                ]}
              >
                <Text style={styles.suggestText}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

/* ---- Reveal: per-badge tick/cross ----------------------------------------- */

function BordersReveal({ reveal }: { reveal: NonNullable<ReturnType<typeof useBordersStore.getState>["reveal"]> }) {
  const next = useBordersStore((s) => s.next);
  const got = reveal.results.filter((r) => r.ok).length;
  return (
    <View style={[styles.reveal, { borderTopColor: reveal.correct ? theme.good : theme.bad }]}>
      <Text style={[styles.revealVerdict, { color: reveal.correct ? theme.good : theme.bad }]}>
        {reveal.correct ? "✓ All correct" : `${got} / ${reveal.results.length}`}
      </Text>
      <Text style={styles.revealName}>{reveal.target.name}</Text>
      <View style={styles.revealList}>
        {reveal.results.map((r) => (
          <Text
            key={r.country.id}
            style={[styles.revealItem, { color: r.ok ? theme.good : theme.bad }]}
          >
            {r.ok ? "✓ " : "✗ "}
            {r.num}. {r.country.name}
          </Text>
        ))}
      </View>
      <Pressable
        onPress={next}
        hasTVPreferredFocus
        style={(state: PressableStateCallbackType) => [
          styles.nextBtn,
          state.focused && styles.nextBtnFocused,
        ]}
      >
        <Text style={styles.nextBtnText}>Next ▸</Text>
      </Pressable>
    </View>
  );
}

/* ---- Shared bits ---------------------------------------------------------- */

function SubmitButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={(state: PressableStateCallbackType) => [
        styles.submit,
        state.focused && styles.submitFocused,
      ]}
    >
      <Text style={styles.submitText}>Submit ▸</Text>
    </Pressable>
  );
}

// Borders session HUD. A copy of components/Scorebar restyled to read the borders
// store (the shared Scorebar is hard-wired to the quiz store, which is idle here).
function BordersScorebar({
  asked,
  total,
  score,
  streak,
  elapsedMs,
}: {
  asked: number;
  total: number;
  score: number;
  streak: number;
  elapsedMs: number;
}) {
  const totalText = Number.isFinite(total) ? String(total) : "∞";
  return (
    <View style={styles.bar} pointerEvents="none">
      <Pill label="Question" value={`${asked} / ${totalText}`} />
      <Pill label="Score" value={String(score)} />
      <Pill label="Streak" value={String(streak)} accent />
      <Pill label="Time" value={Logic.fmtDuration(elapsedMs)} />
    </View>
  );
}

function Pill({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.pill}>
      <Text style={[styles.pillValue, accent && styles.pillValueAccent]}>{value}</Text>
      <Text style={styles.pillLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  content: { alignItems: "center", paddingTop: 96, paddingBottom: 80, paddingHorizontal: 64 },

  promptLabel: { color: theme.creamDim, fontSize: 20, letterSpacing: 2, fontVariant: ["small-caps"] },
  promptName: { color: theme.cream, fontSize: 44, fontFamily: "Georgia", fontWeight: "700" },
  promptSub: { color: theme.creamDim, fontSize: 18, fontStyle: "italic", marginTop: 6, textAlign: "center" },

  frameWrap: { marginTop: 20, borderRadius: 12, overflow: "hidden" },

  /* easy */
  easyWrap: { alignItems: "center", marginTop: 24, gap: 16 },
  candGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center", maxWidth: 1200 },
  cand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.parchment,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 22,
  },
  candAssigned: { backgroundColor: theme.parchment2, borderColor: theme.brass },
  candPicked: { borderColor: theme.forest, transform: [{ scale: 1.04 }] },
  candFocused: { borderColor: theme.brass, transform: [{ scale: 1.06 }] },
  candText: { color: theme.ink, fontSize: 24, fontFamily: "Georgia", fontWeight: "700" },
  candTextAssigned: { color: theme.ink },
  candBadge: {
    color: theme.cream,
    backgroundColor: theme.oxblood,
    fontSize: 18,
    fontWeight: "700",
    width: 30,
    height: 30,
    borderRadius: 15,
    textAlign: "center",
    lineHeight: 30,
    overflow: "hidden",
  },
  hint: { color: theme.creamDim, fontSize: 16, fontStyle: "italic" },
  numRow: { flexDirection: "row", gap: 12, justifyContent: "center", flexWrap: "wrap" },
  numChip: {
    backgroundColor: theme.parchmentInset,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "transparent",
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  numChipOn: { backgroundColor: theme.oxblood, borderColor: theme.cream },
  numChipDisabled: { opacity: 0.4 },
  numChipFocused: { borderColor: theme.brass, transform: [{ scale: 1.08 }] },
  numChipText: { color: theme.ink, fontSize: 28, fontWeight: "700" },
  numChipTextOn: { color: theme.cream },

  /* difficult */
  blanksWrap: { alignItems: "center", marginTop: 24, gap: 16, width: "100%", maxWidth: 900 },
  blankRow: { flexDirection: "row", alignItems: "flex-start", gap: 16, width: "100%" },
  blankNum: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: theme.oxblood,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  blankNumText: { color: theme.cream, fontSize: 24, fontWeight: "700" },
  blankBody: { flex: 1, gap: 10 },
  blankInput: {
    width: "100%",
    backgroundColor: theme.parchment2,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.hair,
    color: theme.ink,
    fontSize: 28,
    fontFamily: "Georgia",
    paddingVertical: 14,
    paddingHorizontal: 22,
  },
  suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  suggest: {
    backgroundColor: theme.parchmentInset,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "transparent",
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  suggestFocused: { borderColor: theme.brass, transform: [{ scale: 1.08 }] },
  suggestText: { color: theme.ink, fontSize: 20, fontWeight: "600" },

  /* submit */
  submit: {
    backgroundColor: theme.brass,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "transparent",
    paddingVertical: 16,
    paddingHorizontal: 48,
    marginTop: 8,
  },
  submitFocused: { borderColor: theme.cream, transform: [{ scale: 1.08 }] },
  submitText: { color: theme.cream, fontSize: 26, fontWeight: "700" },

  /* reveal */
  reveal: {
    width: 900,
    backgroundColor: theme.parchment,
    borderRadius: 16,
    borderTopWidth: 6,
    paddingVertical: 32,
    paddingHorizontal: 44,
    alignItems: "center",
    marginTop: 28,
  },
  revealVerdict: { fontSize: 26, fontWeight: "700", letterSpacing: 1 },
  revealName: { color: theme.ink, fontSize: 40, fontFamily: "Georgia", fontWeight: "700", marginTop: 4 },
  revealList: { flexDirection: "row", flexWrap: "wrap", gap: 16, justifyContent: "center", marginTop: 18 },
  revealItem: { fontSize: 22, fontFamily: "Georgia", fontWeight: "600" },
  nextBtn: {
    backgroundColor: theme.brass,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 44,
    marginTop: 28,
  },
  nextBtnFocused: { borderColor: theme.ink, transform: [{ scale: 1.08 }] },
  nextBtnText: { color: theme.cream, fontSize: 24, fontWeight: "700" },

  /* scorebar */
  bar: { position: "absolute", top: 40, right: 56, flexDirection: "row", gap: 14, zIndex: 20 },
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
  pillValue: { color: theme.cream, fontSize: 30, fontFamily: "Georgia", fontWeight: "700" },
  pillValueAccent: { color: theme.brass },
  pillLabel: { color: theme.creamDim, fontSize: 14, letterSpacing: 1, marginTop: 2, fontVariant: ["small-caps"] },
});
