import { useCallback } from "react";
import { useQuizStore } from "@geobean/core";
import { StubScreen } from "./StubScreen";

export function ExpertQuizScreen() {
  const start = useQuizStore((s) => s.start);
  return <StubScreen name="Expert quiz" onMount={useCallback(() => start(), [start])} />;
}
