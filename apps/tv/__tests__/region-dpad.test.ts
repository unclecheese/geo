import { NAV_REGIONS, type NavRegionId } from "@geobean/core";
import { buildRegionDpad, defaultRegion } from "../src/input/region-dpad";

const DPAD = buildRegionDpad();
const IDS = NAV_REGIONS.map((r) => r.id);

test("every region is dpad-reachable from every other", () => {
  for (const start of IDS) {
    const seen = new Set<NavRegionId>([start]);
    const queue: NavRegionId[] = [start];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const dir of ["n", "e", "s", "w"] as const) {
        const next = DPAD[cur][dir];
        if (next && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(IDS.length);
  }
});

test("dpad edges point to a different, real region", () => {
  for (const id of IDS) {
    for (const dir of ["n", "e", "s", "w"] as const) {
      const next = DPAD[id][dir];
      if (next !== null) {
        expect(next).not.toBe(id);
        expect(IDS).toContain(next);
      }
    }
  }
});

test("defaultRegion is a real region", () => {
  expect(IDS).toContain(defaultRegion());
});
