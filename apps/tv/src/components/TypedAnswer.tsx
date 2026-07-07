import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  type PressableStateCallbackType,
} from "react-native";
import { Logic, suggest, type Country } from "@geobean/core";
import { theme } from "../theme";

/**
 * Difficult-mode typed answering for TV (FOCUS mode). Focusing the TextInput
 * opens the tvOS system keyboard; dictation is a hardware affordance (hold the
 * Siri button with the keyboard up) so there's no app code for it beyond the
 * one-line hint under the field. A row of up to four suggestion buttons is
 * re-queried on every keystroke from the shared core `suggest` (the same ranker
 * web uses), each submitting its own name/capital on press; a Submit button
 * passes the raw typed text through to the grader (matchAnswer is forgiving on
 * case/accents/spelling). When `revealedCount > 0` a hangman mask of the answer
 * is letterboxed above the field, mirroring web (first hint = all-blank mask).
 */
export function TypedAnswer({
  mode,
  item,
  pool,
  revealedCount,
  onSubmit,
}: {
  mode: "name" | "capital";
  item: Country;
  pool: Country[];
  revealedCount: number;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState("");
  const answer = (mode === "capital" ? item.capital : item.name) || "";
  const items = suggest(value, pool, { capital: mode === "capital", limit: 4 });

  const mask = revealedCount > 0 ? Logic.revealName(answer, revealedCount - 1) : null;

  return (
    <View style={styles.wrap}>
      {mask !== null && (
        <View style={styles.maskBox}>
          <Text style={styles.mask}>{mask}</Text>
        </View>
      )}

      <TextInput
        style={styles.input}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={() => onSubmit(value)}
        placeholder={mode === "capital" ? "Type the capital…" : "Type the country…"}
        placeholderTextColor={theme.inkFaint}
        autoCorrect={false}
        autoCapitalize="words"
        returnKeyType="done"
      />

      <Text style={styles.dictationHint}>Hold ◉ Siri to speak</Text>

      {items.length > 0 && (
        <View style={styles.suggestRow}>
          {items.map((c) => {
            const label = (mode === "capital" ? c.capital : c.name) || c.name;
            return (
              <Suggestion key={c.id} label={label} onPress={() => onSubmit(label)} />
            );
          })}
        </View>
      )}

      <Pressable
        onPress={() => onSubmit(value)}
        style={(state: PressableStateCallbackType) => [
          styles.submit,
          state.focused && styles.submitFocused,
        ]}
      >
        <Text style={styles.submitText}>Submit</Text>
      </Pressable>
    </View>
  );
}

function Suggestion({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={(state: PressableStateCallbackType) => [
        styles.suggest,
        state.focused && styles.suggestFocused,
      ]}
    >
      <Text style={styles.suggestText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", width: "100%", maxWidth: 900, gap: 16 },
  maskBox: {
    backgroundColor: "rgba(14, 31, 51, 0.86)",
    borderRadius: 10,
    borderLeftWidth: 4,
    borderLeftColor: theme.brass,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  mask: {
    color: theme.cream,
    fontSize: 36,
    fontFamily: "Georgia",
    letterSpacing: 4,
  },
  input: {
    width: "100%",
    backgroundColor: theme.parchment2,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.hair,
    color: theme.ink,
    fontSize: 32,
    fontFamily: "Georgia",
    paddingVertical: 16,
    paddingHorizontal: 24,
  },
  dictationHint: { color: theme.creamDim, fontSize: 16, fontStyle: "italic" },
  suggestRow: { flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" },
  suggest: {
    backgroundColor: theme.parchmentInset,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  suggestFocused: { borderColor: theme.brass, transform: [{ scale: 1.08 }] },
  suggestText: { color: theme.ink, fontSize: 22, fontWeight: "600" },
  submit: {
    backgroundColor: theme.brass,
    borderRadius: 10,
    borderWidth: 3,
    borderColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 44,
  },
  submitFocused: { borderColor: theme.cream, transform: [{ scale: 1.08 }] },
  submitText: { color: theme.cream, fontSize: 24, fontWeight: "700" },
});
