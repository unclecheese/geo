import { useCallback } from "react";
import { useBordersStore } from "@geobean/core";
import { StubScreen } from "./StubScreen";

export function BordersQuizScreen() {
  const start = useBordersStore((s) => s.start);
  return <StubScreen name="Borders quiz" onMount={useCallback(() => start(), [start])} />;
}
