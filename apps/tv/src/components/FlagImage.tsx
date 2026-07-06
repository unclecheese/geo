import { useState } from "react";
import { View, Image, ActivityIndicator, StyleSheet } from "react-native";
import { flagPng, type Country } from "@geobean/core";
import { theme } from "../theme";

/**
 * Flag prompt for the expert quiz's flag mode. RN's <Image> can't rasterise
 * the SVG flagcdn endpoints web uses (see flagPng's doc comment), so this
 * fetches the PNG variant over the network — the simulator has network access,
 * but a slow/failed load is possible, hence the spinner and the (silent) fixed
 * frame that just stays blank on error rather than throwing.
 */
export function FlagImage({ country }: { country: Country }) {
  const [loading, setLoading] = useState(true);
  const uri = flagPng(country);

  return (
    <View style={styles.frame}>
      {loading && <ActivityIndicator color={theme.brass} size="large" style={styles.spinner} />}
      {uri ? (
        <Image
          source={{ uri }}
          style={styles.image}
          resizeMode="contain"
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
        />
      ) : null}
    </View>
  );
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
});
