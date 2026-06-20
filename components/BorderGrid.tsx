"use client";

import { useState } from "react";
import type { BorderState } from "@/store/quiz-store";

interface BorderGridProps {
  borderState: BorderState;
  answered: boolean;
  onSubmit: (ids: string[]) => void;
}

// "Select every country that borders X" grid. Pre-submit: toggle .sel. Post-
// submit: paint correct / missed / wrong from the grading breakdown. Ported from
// _renderBorderGrid + Quiz.submitBorderExpert's painting.
export function BorderGrid({ borderState, answered, onSubmit }: BorderGridProps) {
  const [sel, setSel] = useState<Set<string>>(new Set());
  const submitted = borderState.submitted;

  const cls = (id: string): string => {
    if (submitted) {
      if (borderState.required.has(id)) return submitted.selected.has(id) ? " correct" : " missed";
      if (submitted.selected.has(id)) return " wrong";
      return "";
    }
    return sel.has(id) ? " sel" : "";
  };

  return (
    <>
      <div className="border-grid">
        {borderState.candidates.map((c) => (
          <button
            key={c.id}
            className={"bsel" + cls(c.id)}
            data-id={c.id}
            disabled={answered}
            onClick={() => {
              if (answered) return;
              setSel((prev) => {
                const next = new Set(prev);
                if (next.has(c.id)) next.delete(c.id);
                else next.add(c.id);
                return next;
              });
            }}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div className="map-actions">
        <button className="btn ghost" disabled={answered} onClick={() => onSubmit([])}>
          None / skip
        </button>
        <button className="btn" disabled={answered} onClick={() => onSubmit([...sel])}>
          Submit
        </button>
      </div>
    </>
  );
}
