import { create } from "zustand";

export type ToastKind = "good" | "bad" | "";

interface ToastState {
  message: string;
  kind: ToastKind;
  visible: boolean;
  // monotonic id so repeated identical messages still re-trigger the timer
  seq: number;
  show: (message: string, kind?: ToastKind) => void;
  hide: () => void;
}

/**
 * Tiny global toast — mirrors UI.toast: a message + kind that auto-hides after
 * 1800ms. The <Toast> component subscribes and renders #toast with the same
 * classes so the ported CSS applies. The timer lives here so any caller can fire.
 */
let timer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set, get) => ({
  message: "",
  kind: "",
  visible: false,
  seq: 0,
  show: (message, kind = "") => {
    set({ message, kind, visible: true, seq: get().seq + 1 });
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => set({ visible: false }), 1800);
  },
  hide: () => {
    if (timer) clearTimeout(timer);
    set({ visible: false });
  },
}));

// Imperative helper for non-React callers (the quiz store).
export const toast = (message: string, kind?: ToastKind) =>
  useToastStore.getState().show(message, kind);
