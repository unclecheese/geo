import { useEffect } from "react";

// Stop the browser's own pinch/ctrl-wheel page zoom while a full-screen map is
// mounted, so a trackpad pinch (or a touch pinch) only zooms the map — never the
// whole page. D3's own wheel handler still drives the map zoom; we just also
// swallow the gesture the browser would otherwise act on.
export function usePinchGuard() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      // A trackpad pinch arrives as a wheel event with ctrlKey set.
      if (e.ctrlKey) e.preventDefault();
    };
    const onGesture = (e: Event) => e.preventDefault(); // Safari pinch
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("gesturestart", onGesture as EventListener);
    window.addEventListener("gesturechange", onGesture as EventListener);
    window.addEventListener("gestureend", onGesture as EventListener);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("gesturestart", onGesture as EventListener);
      window.removeEventListener("gesturechange", onGesture as EventListener);
      window.removeEventListener("gestureend", onGesture as EventListener);
    };
  }, []);
}
