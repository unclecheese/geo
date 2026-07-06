import type { Country } from "./types";

/** The map-view surface the quiz store drives. Web registers MapView; TV
 *  registers its Skia controller; expert/borders run with none registered. */
export interface MapPort {
  isReady(): boolean;
  readonly tinyIds: Set<string>;
  clearHighlights(): void;
  flashSelect(id: string): void;
  frameCountry(c: Country, pad?: number): void;
  markArrow(c: Country): void;
  paint(id: string, kind: "good" | "bad" | "target" | "sel"): void;
  refreshColors(): void;
  reset(): void;
}

export interface FxPort {
  hint(): void; correct(): void; wrong(): void; milestone(): void; confetti(): void;
}

let _map: MapPort | null = null;
export function setMapPort(p: MapPort | null): void { _map = p; }
export function mapPort(): MapPort | null { return _map && _map.isReady() ? _map : null; }

const NOOP_FX: FxPort = { hint() {}, correct() {}, wrong() {}, milestone() {}, confetti() {} };
let _fx: FxPort = NOOP_FX;
export function setFxPort(p: FxPort): void { _fx = p; }
export function fx(): FxPort { return _fx; }
