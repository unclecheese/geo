import { useCallback } from "react";
import { useQuizStore } from "@geobean/core";
import { StubScreen } from "./StubScreen";

export function MapQuizScreen() {
  const start = useQuizStore((s) => s.start);
  return <StubScreen name="Map quiz" onMount={useCallback(() => start(), [start])} />;
}
