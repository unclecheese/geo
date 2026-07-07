import type { FxPort } from "@geobean/core";
import { useAtlasStore } from "@geobean/core";

/**
 * tvOS FxPort.
 *
 * SOUND — shipped SILENT (no-op cues). This is a deliberate go/no-go outcome, not
 * an oversight. The obvious library, `react-native-sound`, declares only
 * `s.platform = :ios` in its podspec, so CocoaPods rejects it under this app's
 * `platform :tvos` Podfile — `pod install` fails outright. Its native RNSound.mm
 * also leans on AVAudioSession categories/modes (GameChat, VideoRecording, route
 * + interruption handling) that don't all exist on tvOS. The Expo audio modules
 * (`expo-av`/`expo-audio`) would mean grafting the whole Expo modules runtime onto
 * this bare RN-tvOS new-architecture project — invasive and fragile. Sound is
 * `settings.sound`-gated and OFF by default (matching web), so a clean silent
 * build is strictly better than a broken pod. The cues below stay as no-ops; if a
 * tvOS-supported audio pod appears, wire it here behind the same `soundOn()` gate.
 *
 * CONFETTI — real. Skia is already a dependency and builds on tvOS (see TvFrame),
 * so `confetti()` fires a one-shot particle burst through a tiny local event bus
 * that the <TvConfetti> overlay (mounted once in App) subscribes to.
 */

const soundOn = (): boolean => {
  try {
    return useAtlasStore.getState().settings.sound;
  } catch {
    return false;
  }
};

// Minimal fire-and-forget bus so the store-side confetti() call (no React
// context there) can reach the mounted overlay. One listener in practice.
type Listener = () => void;
const confettiListeners = new Set<Listener>();

export function onConfetti(fn: Listener): () => void {
  confettiListeners.add(fn);
  return () => confettiListeners.delete(fn);
}

export const fxTv: FxPort = {
  // Audio cues intentionally silent on tvOS — see the module doc comment. Kept as
  // named methods (not a shared stub) so the day a tvOS audio pod lands, each cue
  // has an obvious home and the soundOn() gate is already threaded.
  hint() {
    if (!soundOn()) return;
  },
  correct() {
    if (!soundOn()) return;
  },
  wrong() {
    if (!soundOn()) return;
  },
  milestone() {
    if (!soundOn()) return;
  },
  confetti() {
    confettiListeners.forEach((fn) => fn());
  },
};
