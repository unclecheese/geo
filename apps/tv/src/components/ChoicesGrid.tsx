import { View, Text, Pressable, StyleSheet, type PressableStateCallbackType } from "react-native";
import type { Country, ChoiceResult } from "@geobean/core";
import { theme } from "../theme";
import { fonts } from "../fonts";

interface ChoicesGridProps {
  choices: Country[];
  choiceResult: ChoiceResult | null;
  eliminatedIds: string[];
  onChoose(c: Country): void;
  labelFor?(c: Country): string;
}

/**
 * 2x2 multiple-choice grid — the 10-foot counterpart to web's `.choices`/
 * `.choice` (see apps/web/components/Choices.tsx for the marking semantics
 * this mirrors). Generic over the label and the country set so Task 15's
 * expert screen can reuse it verbatim for capital/flag.
 *
 * Marking: once `choiceResult` is set the correct option goes green and the
 * picked-wrong option goes red; before that, options in `eliminatedIds`
 * (struck by a hint) are disabled and dimmed. `hasTVPreferredFocus` lands on
 * the first still-pickable option so the focus engine has somewhere to start
 * the moment the grid mounts.
 */
export function ChoicesGrid({
  choices,
  choiceResult,
  eliminatedIds,
  onChoose,
  labelFor,
}: ChoicesGridProps) {
  const eliminated = new Set(eliminatedIds);
  const answered = choiceResult !== null;
  const firstPickableId = choices.find((c) => !eliminated.has(c.id))?.id;

  return (
    <View style={styles.grid}>
      {choices.map((c) => {
        const isEliminated = eliminated.has(c.id);
        const isCorrect = answered && c.id === choiceResult.correctId;
        const isWrong = answered && !isCorrect && c.id === choiceResult.pickedId;
        const disabled = answered || isEliminated;

        return (
          <Pressable
            key={c.id}
            disabled={disabled}
            onPress={() => onChoose(c)}
            hasTVPreferredFocus={c.id === firstPickableId}
            style={(state: PressableStateCallbackType) => [
              styles.choice,
              isEliminated && !answered && styles.choiceEliminated,
              isCorrect && styles.choiceCorrect,
              isWrong && styles.choiceWrong,
              state.focused && !disabled && styles.choiceFocused,
            ]}
          >
            <Text
              style={[
                styles.label,
                isEliminated && !answered && styles.labelEliminated,
                isCorrect && styles.labelCorrect,
                isWrong && styles.labelWrong,
              ]}
            >
              {labelFor ? labelFor(c) : c.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Verdict tints, lifted from web's --good-tint / --bad-tint and the dark
// green/red choice text (#1f5236 / #6f2418), nudged a touch more opaque so the
// fill still reads from ten feet.
const GOOD_TINT = "rgba(47, 111, 78, 0.18)";
const BAD_TINT = "rgba(166, 64, 44, 0.16)";
const GOOD_INK = "#1f5236";
const BAD_INK = "#6f2418";

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 840,
    gap: 16,
    justifyContent: "center",
    marginTop: 24,
  },
  choice: {
    width: 412,
    backgroundColor: theme.parchment2,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.hair,
    paddingVertical: 22,
    paddingHorizontal: 26,
  },
  choiceFocused: {
    backgroundColor: "#fffdf6",
    borderColor: theme.brass,
    transform: [{ scale: 1.06 }],
  },
  choiceEliminated: {
    opacity: 0.4,
  },
  choiceCorrect: {
    backgroundColor: GOOD_TINT,
    borderColor: theme.good,
  },
  choiceWrong: {
    backgroundColor: BAD_TINT,
    borderColor: theme.bad,
  },
  label: {
    color: theme.ink,
    fontSize: 28,
    fontFamily: fonts.bodySemi,
    textAlign: "left",
  },
  labelEliminated: {
    color: theme.inkFaint,
    textDecorationLine: "line-through",
  },
  labelCorrect: {
    color: GOOD_INK,
  },
  labelWrong: {
    color: BAD_INK,
  },
});
