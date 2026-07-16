import { useEffect, useState } from "react";

// True on touch-primary devices (tablets/phones), so copy can say "tap" instead
// of "click". Starts false to match SSR, then resolves on mount.
export function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setCoarse(mq.matches);
    const onChange = () => setCoarse(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return coarse;
}
