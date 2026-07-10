import { useState } from "react";
import { View, Text, Image, Pressable, StyleSheet } from "react-native";
import { flagPng, type Country, type RevealState } from "@geobean/core";
import { theme } from "../theme";
import { fonts } from "../fonts";

/**
 * Post-grade feedback card — the 10-foot port of web's <Reveal> (see
 * apps/web/components/Reveal.tsx). A parchment panel with the flag, country
 * name and "Capital: X · subregion" on the left, a small-caps verdict top-right,
 * a meta row (Region / Borders / Time), and a full-width brass "Next ▸" button.
 * The button is deliberately NON-focusable: the map screen never engages the
 * tvOS focus engine in find mode (the QuizCard is pointerEvents="none" and input
 * is driven imperatively), so Select is handled there — `onSelect` calls
 * `next()` while the reveal is up. Kept focusable it would ALSO fire onPress on
 * that same Select press and advance twice; non-focusable makes it a pure visual
 * affordance, permanently styled as the primary action.
 * The panel's top edge is tinted good/bad to echo web's coloured box-shadow.
 * (Quitting mid-round is the remote's Menu button — see useMenuButtonBack — so
 * there's no separate End button here, matching web.)
 */
export function RevealCard({ reveal, onNext }: { reveal: RevealState; onNext: () => void }) {
  const { item, correct, ms } = reveal;

  const meta: string[] = [`Region: ${item.region}`];
  if (item.neighbours.length) meta.push(`Borders: ${item.neighbours.length}`);
  meta.push(`Time: ${(ms / 1000).toFixed(1)}s`);

  const verdictColor = correct ? theme.good : theme.bad;

  return (
    <View style={styles.backdrop}>
      <View style={[styles.card, { borderTopColor: verdictColor }]}>
        <View style={styles.head}>
          <RevealFlag country={item} />
          <View style={styles.headText}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.cap}>
              Capital: {item.capital || "—"} · {item.subregion || item.region}
            </Text>
          </View>
          <Text style={[styles.verdict, { color: verdictColor }]}>
            {correct ? "✓ Correct" : "✕ Missed"}
          </Text>
        </View>

        <View style={styles.metaRow}>
          {meta.map((m) => (
            <Text key={m} style={styles.meta}>
              {m}
            </Text>
          ))}
        </View>

        <Pressable onPress={onNext} focusable={false} style={styles.next}>
          <Text style={styles.nextText}>Next ▸</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Small flag chip (web's `.rv-flag` / `.rv-flag-ph`). Falls back to the emoji
 *  or a flag glyph if the PNG is missing or fails to load. */
function RevealFlag({ country }: { country: Country }) {
  const [failed, setFailed] = useState(false);
  const uri = flagPng(country);

  if (!uri || failed) {
    return (
      <View style={styles.flagPh}>
        <Text style={styles.flagPhText}>{country.flagEmoji || "🏳"}</Text>
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={styles.flag}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6, 15, 27, 0.55)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 50,
  },
  card: {
    width: 920,
    backgroundColor: theme.parchment2,
    borderRadius: 16,
    borderTopWidth: 6,
    borderTopColor: theme.brass,
    paddingVertical: 36,
    paddingHorizontal: 44,
    shadowColor: "#06101c",
    shadowOpacity: 0.42,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 16 },
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
  },
  flag: {
    width: 150,
    height: 100,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.hair,
  },
  flagPh: {
    width: 150,
    height: 100,
    borderRadius: 6,
    backgroundColor: theme.parchmentInset,
    alignItems: "center",
    justifyContent: "center",
  },
  flagPhText: { fontSize: 56 },
  headText: { flex: 1 },
  name: { color: theme.ink, fontSize: 54, fontFamily: fonts.displaySemi },
  cap: { color: theme.inkDim, fontSize: 26, fontFamily: fonts.body, marginTop: 4 },
  verdict: {
    fontSize: 26,
    fontFamily: fonts.bodySemi,
    fontVariant: ["small-caps"],
    letterSpacing: 1,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 28,
    marginTop: 22,
  },
  meta: { color: theme.inkFaint, fontSize: 22, fontFamily: fonts.body },
  next: {
    // Non-focusable, so it carries the "primary action" look permanently
    // (what used to be the focused state): ink border + slight scale-up.
    marginTop: 30,
    backgroundColor: theme.brass,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: theme.ink,
    paddingVertical: 20,
    alignItems: "center",
    transform: [{ scale: 1.03 }],
  },
  nextText: { color: theme.cream, fontSize: 32, fontFamily: fonts.displaySemi },
});
