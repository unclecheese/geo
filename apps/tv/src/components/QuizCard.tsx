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
 * (see apps/web/app/map/page.tsx and apps/web/app/quiz/page.tsx). Two layouts,
 * picked by `variant`:
 *
 * - `"card"` (default, expert screen): a centred parchment panel — a `.q-top`
 *   header (kicker left, "asked / total" right), a brass `.q-bar`, then the
 *   `children` (prompt/sub/flag/controls) stacked inside.
 * - `"bar"` (map screen): web's redesigned HUD — a wide (90%) rounded card
 *   floating just off the bottom edge, with a progress-pill on its flat top edge
 *   (inset from the corners), then Row 1 = kicker + count and Row 2 (`.q-head`)
 *   = the `body` (prompt + sub) on the LEFT and the low-key `hint` affordance on
 *   the RIGHT, and the `children` (find hint-list / name choices / typed) below
 *   at a contained width. Height is content-driven: compact for find, growing
 *   for name. Positioning (width, centring, bottom float) is the screen's job;
 *   this component carries no absolute position of its own.
 *
 * The body helpers below (`QPrompt`, `Em`, `QSub`, `Hangman`, `HintList`,
 * `HintButton`, `HintNote`) mirror web's `.q-prompt`/`.em`/`.q-sub`/`.hangman`/
 * `.hint-list`/`.hint-btn` one-for-one so the two clients read identically.
 */
export function QuizCard({
  kicker,
  asked,
  total,
  variant = "card",
  body,
  hint,
  style,
  children,
}: {
  kicker: string;
  asked: number;
  total: number;
  variant?: "card" | "bar";
  body?: ReactNode;
  hint?: ReactNode;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const endless = !Number.isFinite(total);
  const progressText = `${asked} / ${endless ? "∞" : total}`;
  const pct = endless || total <= 0 ? 0 : Math.round((asked / total) * 100);

  if (variant === "bar") {
    return (
      <View style={styles.bar}>
        {/* Progress hairline flush along the top edge, full bar width. */}
        <View style={styles.barProgress}>
          <View style={[styles.barProgressFill, { width: `${pct}%` }]} />
        </View>
        <View style={styles.inner}>
          <View style={styles.qTop}>
            <Text style={styles.qMode}>{kicker}</Text>
            <Text style={styles.qProgress}>{progressText}</Text>
          </View>
          {/* Row 2: prompt/sub on the left, hint on the right, centred. */}
          <View style={styles.qHead}>
            <View style={styles.qHeadBody}>{body}</View>
            {hint ? <View style={styles.qHeadHint}>{hint}</View> : null}
          </View>
          {children ? <View style={styles.barControls}>{children}</View> : null}
        </View>
      </View>
    );
  }

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
  inline,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  /** In the map "bar" HUD the button sits in the centred q-head hint slot, so
   *  drop the stacked top margin the expert card wants. */
  inline?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.hintBtnHit, inline && styles.hintBtnHitInline]}
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
    <Text style={styles.hintBtn}>
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
  // Map-screen "bar" variant: a wide (90%) rounded card floating just off the
  // bottom edge (positioned by the screen's hudWrap), all corners rounded, a
  // hairline border all round and a soft downward shadow — the map reads around
  // it. Width/float/centre live in the screen; this carries the card look.
  bar: {
    width: "90%",
    backgroundColor: theme.parchment,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: theme.stroke,
    shadowColor: "#06101c",
    shadowOpacity: 0.42,
    shadowRadius: 34,
    shadowOffset: { width: 0, height: 12 },
  },
  // Progress hairline: a pill on the flat top edge, inset by the corner radius
  // so its rounded ends sit on the straight part and never hit the curves.
  barProgress: {
    height: 6,
    marginTop: 18,
    marginHorizontal: 28,
    borderRadius: 999,
    backgroundColor: theme.parchmentInset,
    overflow: "hidden",
  },
  barProgressFill: { height: 6, backgroundColor: theme.brass },
  // Content column (web's .hud-inner) — just fills the card with padding.
  inner: {
    paddingTop: 12,
    paddingHorizontal: 46,
    paddingBottom: 30,
  },
  qHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 28,
  },
  qHeadBody: { flex: 1, flexShrink: 1 },
  qHeadHint: { flexShrink: 0 },
  // Controls (find hint-list / name choices / typed): below the head, left-
  // aligned at a readable width rather than stretched across the whole bar.
  barControls: { width: "100%", maxWidth: 900, alignSelf: "flex-start", marginTop: 14 },
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
  hintBtnHitInline: {
    marginTop: 0,
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
});
