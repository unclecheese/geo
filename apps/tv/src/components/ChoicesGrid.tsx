import { View, Text, Pressable, StyleSheet, type PressableStateCallbackType } from "react-native";
import type { Country, ChoiceResult } from "@geobean/core";
import { theme } from "../theme";

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
                (isCorrect || isWrong) && styles.labelMarked,
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

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 720,
    gap: 16,
    justifyContent: "center",
  },
  choice: {
    width: 340,
    backgroundColor: theme.parchment,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: "transparent",
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  choiceFocused: {
    borderColor: theme.brass,
    transform: [{ scale: 1.06 }],
  },
  choiceEliminated: {
    backgroundColor: theme.parchmentInset,
    opacity: 0.45,
  },
  choiceCorrect: {
    backgroundColor: theme.good,
    borderColor: theme.good,
  },
  choiceWrong: {
    backgroundColor: theme.bad,
    borderColor: theme.bad,
  },
  label: {
    color: theme.ink,
    fontSize: 26,
    fontFamily: "Georgia",
    fontWeight: "700",
    textAlign: "center",
  },
  labelEliminated: {
    color: theme.inkFaint,
    textDecorationLine: "line-through",
  },
  labelMarked: {
    color: theme.cream,
  },
});
