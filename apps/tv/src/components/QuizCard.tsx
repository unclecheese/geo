import {
  View,
  Text,
  Pressable,
  StyleSheet,
  type ViewStyle,
  type StyleProp,
  type PressableStateCallbackType,
} from "react-native";
import type { ReactNode } from "react";
import { theme } from "../theme";
import { fonts } from "../fonts";

/**
 * The web-style question card — the 10-foot port of web's `#hud` / `.quiz-stage`
 * (see apps/web/app/map/page.tsx and apps/web/app/quiz/page.tsx). A parchment
 * panel with a `.q-top` header (mode kicker left, "asked / total" progress
 * right), a brass `.q-bar` progress bar, then whatever body + controls the
 * screen stacks inside it. Find / name / capital / flag all share this frame;
 * only the body (prompt/sub/hangman/hints) and controls (choices/typed/hint)
 * differ. Positioning is the screen's job — the map screen anchors it bottom
 * centre, the expert screen centres it — so this component carries no layout
 * position of its own.
 *
 * The body helpers below (`QPrompt`, `Em`, `QSub`, `Hangman`, `HintList`,
 * `HintButton`, `HintNote`) mirror web's `.q-prompt`/`.em`/`.q-sub`/`.hangman`/
 * `.hint-list`/`.hint-btn` one-for-one so the two clients read identically.
 */
export function QuizCard({
  kicker,
  asked,
  total,
  style,
  children,
}: {
  kicker: string;
  asked: number;
  total: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const endless = !Number.isFinite(total);
  const progressText = `${asked} / ${endless ? "∞" : total}`;
  const pct = endless || total <= 0 ? 0 : Math.round((asked / total) * 100);

  return (
    <View style={[styles.card, style]}>
      <View style={styles.qTop}>
        <Text style={styles.qMode}>{kicker}</Text>
        <Text style={styles.qProgress}>{progressText}</Text>
      </View>
      <View style={styles.qBar}>
        <View style={[styles.qBarFill, { width: `${pct}%` }]} />
      </View>
      {children}
    </View>
  );
}

/** Big serif question title. Nest <Em> for the brass-italic emphasised word. */
export function QPrompt({ children }: { children: ReactNode }) {
  return <Text style={styles.qPrompt}>{children}</Text>;
}

/** The brass-italic emphasised span inside a prompt (web's `.q-prompt .em`). */
export function Em({ children }: { children: ReactNode }) {
  return <Text style={styles.em}>{children}</Text>;
}

/** Italic subtitle under the prompt (web's `.q-sub`). */
export function QSub({ children }: { children: ReactNode }) {
  return <Text style={styles.qSub}>{children}</Text>;
}

/** Monospace, letter-spaced hangman mask for difficult typed modes. */
export function Hangman({ children }: { children: ReactNode }) {
  return <Text style={styles.hangman}>{children}</Text>;
}

/** Cumulative find-mode location hints, styled as web's `.hint-list`. */
export function HintList({ hints }: { hints: string[] }) {
  if (!hints.length) return null;
  return (
    <View style={styles.hintList}>
      {hints.map((h) => (
        <View key={h} style={styles.hintItem}>
          <Text style={styles.hintItemText}>{h}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Focusable, low-key hint escape hatch (web's `.hint-btn`) for the FOCUS-mode
 * screens (name, expert). Muted italic text link; brass + scaled when focused,
 * dimmed when there are no hints left.
 */
export function HintButton({
  label,
  disabled,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={styles.hintBtnHit}
    >
      {(state: PressableStateCallbackType) => (
        <Text
          style={[
            styles.hintBtn,
            state.focused && !disabled && styles.hintBtnFocused,
            disabled && styles.hintBtnDisabled,
          ]}
        >
          {"💡 "}
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Non-focusable hint affordance for find mode — the find card is
 * `pointerEvents="none"` so it can't steal the cursor, so the hint reads as a
 * static note. Hints there are triggered by the remote's Play/Pause.
 */
export function HintNote({ label }: { label: string }) {
  return (
    <Text style={[styles.hintBtn, styles.hintNote]}>
      {"💡 "}
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 960,
    backgroundColor: theme.parchment,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.stroke,
    paddingVertical: 34,
    paddingHorizontal: 40,
    shadowColor: "#06101c",
    shadowOpacity: 0.42,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 16 },
  },
  qTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  qMode: {
    color: theme.forest,
    fontSize: 22,
    letterSpacing: 2,
    fontVariant: ["small-caps"],
    fontFamily: fonts.bodyMedium,
  },
  qProgress: {
    color: theme.inkFaint,
    fontSize: 22,
    fontFamily: fonts.bodyMedium,
    fontVariant: ["tabular-nums"],
  },
  qBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.parchmentInset,
    overflow: "hidden",
    marginTop: 14,
    marginBottom: 22,
  },
  qBarFill: {
    height: 8,
    borderRadius: 999,
    backgroundColor: theme.brass,
  },
  qPrompt: {
    color: theme.ink,
    fontSize: 46,
    lineHeight: 56,
    fontFamily: fonts.displaySemi,
  },
  em: {
    color: theme.brass,
    fontStyle: "italic",
    fontFamily: fonts.displaySemi,
  },
  qSub: {
    color: theme.inkDim,
    fontSize: 24,
    fontStyle: "italic",
    marginTop: 8,
    fontFamily: fonts.body,
  },
  hangman: {
    marginTop: 20,
    fontFamily: "Menlo",
    fontSize: 42,
    fontWeight: "700",
    letterSpacing: 6,
    color: theme.brass,
    textAlign: "center",
  },
  hintList: {
    marginTop: 22,
    gap: 10,
  },
  hintItem: {
    backgroundColor: theme.parchmentInset,
    borderWidth: 1,
    borderColor: theme.hair,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  hintItemText: {
    color: theme.inkDim,
    fontSize: 26,
    fontFamily: fonts.body,
  },
  hintBtnHit: {
    alignSelf: "center",
    marginTop: 22,
  },
  hintBtn: {
    color: theme.inkFaint,
    fontSize: 24,
    fontFamily: fonts.body,
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  hintBtnFocused: {
    color: theme.brass,
    textDecorationLine: "underline",
  },
  hintBtnDisabled: {
    opacity: 0.4,
  },
  hintNote: {
    marginTop: 22,
    alignSelf: "center",
  },
});
