import { describe, it, expect } from "vitest";
import { setMapPort, mapPort, fx, type MapPort } from "../ports";

const fake = (ready: boolean): MapPort => ({
  isReady: () => ready,
  tinyIds: new Set<string>(),
  clearHighlights() {}, flashSelect() {}, frameCountry() {}, markArrow() {},
  paint() {}, refreshColors() {}, reset() {},
});

describe("ports", () => {
  it("mapPort() is null when nothing registered", () => {
    setMapPort(null);
    expect(mapPort()).toBeNull();
  });
  it("mapPort() hides a not-ready implementation", () => {
    setMapPort(fake(false));
    expect(mapPort()).toBeNull();
  });
  it("mapPort() returns a ready implementation", () => {
    const p = fake(true);
    setMapPort(p);
    expect(mapPort()).toBe(p);
  });
  it("fx() defaults to safe no-ops", () => {
    expect(() => { fx().correct(); fx().confetti(); }).not.toThrow();
  });
});
