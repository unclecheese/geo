"use client";

import { useEffect, useRef } from "react";
import { Confetti } from "@/lib/fx";

// The full-screen confetti canvas, fixed behind overlays. Initialised once so
// Confetti.burst() (fired from the quiz store on streak milestones / round end)
// has a context to draw into.
export function FxCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) Confetti.init(ref.current);
  }, []);
  return <canvas id="fx-canvas" ref={ref} />;
}
