"use client";

import { useEffect, useRef } from "react";
import { BuildView } from "@/lib/build-view";
import { useBuildStore } from "@/store/build-store";

// The D3 continent builder: React owns the DOM refs; D3 owns everything inside.
// StrictMode-safe: destroy() is idempotent; init() calls destroy() first if
// already initialised (handles the double-mount).
export function BuildViewComponent() {
  const svgRef      = useRef<SVGSVGElement>(null);
  const wrapRef     = useRef<HTMLDivElement>(null);
  const bankRef     = useRef<HTMLDivElement>(null);
  const timerRef    = useRef<HTMLDivElement>(null);
  const subRef      = useRef<HTMLDivElement>(null);
  const nameRef     = useRef<HTMLDivElement>(null);
  const nameHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const svgEl      = svgRef.current;
    const wrapEl     = wrapRef.current;
    const bankEl     = bankRef.current;
    const timerEl    = timerRef.current;
    const subEl      = subRef.current;
    const nameEl     = nameRef.current;
    const nameHostEl = nameHostRef.current;
    if (!svgEl || !wrapEl || !bankEl || !timerEl || !subEl || !nameEl || !nameHostEl) return;

    BuildView.init(svgEl, wrapEl, bankEl, timerEl, subEl, nameEl, nameHostEl);

    // Wire callbacks to the store — one-directional; build-view never imports
    // build-store at module level, avoiding a circular dependency.
    BuildView.onPlace   = (c) => useBuildStore.getState().afterPlace(c);
    BuildView.onMistake = ()  => useBuildStore.getState().afterMistake();
    BuildView.onHint    = (c) => useBuildStore.getState().hint(c);

    // If the store already has a model (StrictMode remount after quit/restart),
    // show it immediately.
    const model = useBuildStore.getState().model;
    if (model) BuildView.show(model);

    return () => {
      BuildView.destroy();
    };
  }, []);

  return (
    <>
      {/* Map canvas */}
      <div id="build-wrap" ref={wrapRef}>
        <svg id="build-svg" ref={svgRef} />
      </div>

      {/* Banner — D3 writes .bb-sub and .bb-timer text imperatively */}
      <div id="build-banner">
        <div className="bb-title" id="build-title">Build a continent</div>
        <div className="bb-sub" id="build-sub" ref={subRef}>Drag each country onto the map</div>
        <div className="bb-timer" id="build-timer" ref={timerRef} hidden />
      </div>

      {/* Name-for-credit prompt (unnamed mode) */}
      <div id="build-name" ref={nameRef} hidden>
        <div className="bn-prompt">Name the country you just placed</div>
        <div id="build-name-host" ref={nameHostRef} />
      </div>

      {/* Country bank — D3/BuildView populates this imperatively */}
      <div id="build-bank" ref={bankRef} aria-label="Country bank" />
    </>
  );
}
