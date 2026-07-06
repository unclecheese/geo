import { cursorReduce, clickReduce } from "../src/input/cursor-logic";

const B = { w: 1920, h: 1080 };

test("Began anchors without moving the cursor", () => {
  const c = cursorReduce({ x: 960, y: 540, lastSample: null }, { state: "Began", x: 0, y: 0 }, 1.6, B);
  expect([c.x, c.y]).toEqual([960, 540]);
  expect(c.lastSample).toEqual({ x: 0, y: 0 });
});

test("Changed applies gain-scaled deltas from the previous sample", () => {
  let c = cursorReduce({ x: 960, y: 540, lastSample: null }, { state: "Began", x: 0, y: 0 }, 2, B);
  c = cursorReduce(c, { state: "Changed", x: 10, y: -5 }, 2, B);
  expect([c.x, c.y]).toEqual([980, 530]);
  c = cursorReduce(c, { state: "Changed", x: 30, y: -5 }, 2, B); // delta from LAST sample, not origin
  expect([c.x, c.y]).toEqual([1020, 530]);
});

test("clamps to bounds and Ended clears the anchor", () => {
  let c = cursorReduce({ x: 5, y: 5, lastSample: { x: 0, y: 0 } }, { state: "Changed", x: -100, y: -100 }, 2, B);
  expect([c.x, c.y]).toEqual([0, 0]);
  c = cursorReduce(c, { state: "Ended", x: 0, y: 0 }, 2, B);
  expect(c.lastSample).toBeNull();
});

test("two selects within 250ms = double; a lone select fires single on timeout", () => {
  let r = clickReduce({ pendingSince: null }, 1000);
  expect(r.fire).toBeNull();
  expect(r.state.pendingSince).toBe(1000);
  r = clickReduce(r.state, 1180);
  expect(r.fire).toBe("double");
  expect(r.state.pendingSince).toBeNull();
  // and the timeout path is the caller's setTimeout observing pendingSince unchanged
  r = clickReduce({ pendingSince: null }, 2000);
  expect(r.state.pendingSince).toBe(2000);
});
