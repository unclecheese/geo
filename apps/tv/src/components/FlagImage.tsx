import { useState } from "react";
import { View, Image, Text, ActivityIndicator, StyleSheet } from "react-native";
import { flagPng, type Country } from "@geobean/core";
import { theme } from "../theme";

/**
 * Flag prompt for the expert quiz's flag mode. RN's <Image> can't rasterise
 * the SVG flagcdn endpoints web uses (see flagPng's doc comment), so this
 * fetches the PNG variant over the network — the simulator has network access,
 * but a slow/failed load is possible, hence the spinner.
 *
 * On a missing cca2 (no PNG URL) or a network error the frame would otherwise
 * stay permanently blank, which reads as a broken question. Fall back to the
 * country's flag emoji if it has one, else a "flag unavailable" note, so the
 * player always sees the frame resolve to something.
 */
export function FlagImage({ country }: { country: Country }) {
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const uri = flagPng(country);
  const showFallback = !uri || failed;

  return (
    <View style={styles.frame}>
      {loading && !showFallback && (
        <ActivityIndicator color={theme.brass} size="large" style={styles.spinner} />
      )}
      {showFallback ? (
        <Fallback country={country} />
      ) : (
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode="contain"
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setFailed(true);
          }}
        />
      )}
    </View>
  );
}

function Fallback({ country }: { country: Country }) {
  if (country.flagEmoji) {
    return <Text style={styles.emoji}>{country.flagEmoji}</Text>;
  }
  return <Text style={styles.unavailable}>Flag unavailable</Text>;
}

const styles = StyleSheet.create({
  frame: {
    width: 480,
    height: 320,
    backgroundColor: theme.parchment,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: theme.hair,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  image: { width: "100%", height: "100%" },
  spinner: { position: "absolute" },
  emoji: { fontSize: 200 },
  unavailable: { color: theme.inkFaint, fontSize: 28, fontStyle: "italic" },
});
