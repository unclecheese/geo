"use client";
import { setMapPort, setFxPort } from "@geobean/core";
import { MapView } from "@/lib/map-view";
import { Audio2, Confetti } from "@/lib/fx";

/** Bridge the browser singletons into core's ports. Client-only module —
 *  import it dynamically (map-view touches DOM at init). */
export function registerWebPorts(): void {
  setMapPort({
    isReady: () => MapView._inited,
    get tinyIds() { return MapView.tinyIds; },
    clearHighlights: () => MapView.clearHighlights(),
    flashSelect: (id) => MapView.flashSelect(id),
    frameCountry: (c, pad) => MapView.frameCountry(c, pad),
    markArrow: (c) => MapView.markArrow(c),
    paint: (id, kind) => MapView.paint(id, kind),
    refreshColors: () => MapView.refreshColors(),
    reset: () => MapView.reset(),
  });
  setFxPort({
    hint: () => Audio2.hint(),
    correct: () => Audio2.correct(),
    wrong: () => Audio2.wrong(),
    milestone: () => Audio2.milestone(),
    confetti: () => Confetti.burst(),
  });
}
