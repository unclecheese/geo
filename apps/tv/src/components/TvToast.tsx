import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text } from "react-native";
import { useToastStore } from "@geobean/core";
import { theme } from "../theme";
import { fonts } from "../fonts";

/**
 * Non-focusable top-centre banner, the tvOS render of the shared toast store —
 * the same store the quiz drives for praise, "Not quite — it's X", and pool
 * warnings. Web's #toast slides down from the top and auto-hides after 1800ms
 * (the store owns that timer); this mirrors the slide + good/bad left border,
 * animating opacity/translateY off the store's `visible` flag. It sits above
 * the navigator (mounted once in App) so it overlays every screen and never
 * takes focus.
 */
export function TvToast() {
  const message = useToastStore((s) => s.message);
  const kind = useToastStore((s) => s.kind);
  const visible = useToastStore((s) => s.visible);

  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  const tint =
    kind === "good" ? theme.good : kind === "bad" ? theme.bad : theme.brass;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toast,
        { borderLeftColor: tint },
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [-40, 0],
              }),
            },
          ],
        },
      ]}
    >
      <Text style={styles.text}>{message}</Text>
    </Animated.View>
  );
}

const WIDTH = 720;

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    top: 48,
    left: "50%",
    marginLeft: -WIDTH / 2,
    width: WIDTH,
    backgroundColor: "rgba(14, 31, 51, 0.94)",
    borderRadius: 12,
    borderLeftWidth: 5,
    paddingVertical: 18,
    paddingHorizontal: 28,
    zIndex: 100,
  },
  text: {
    color: theme.cream,
    fontSize: 26,
    fontFamily: fonts.body,
    textAlign: "center",
  },
});
