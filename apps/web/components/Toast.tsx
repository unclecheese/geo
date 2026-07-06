"use client";

import { useToastStore } from "@/store/toast-store";

// #toast overlay — driven by the global toast store. Mirrors UI.toast markup so
// the ported #toast CSS (slide-in + good/bad borders) applies unchanged.
export function Toast() {
  const message = useToastStore((s) => s.message);
  const kind = useToastStore((s) => s.kind);
  const visible = useToastStore((s) => s.visible);
  const cls = "" + (visible ? " show" : "") + (kind ? " " + kind : "");
  return (
    <div id="toast" className={cls.trim()}>
      {message}
    </div>
  );
}
