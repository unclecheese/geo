"use client";

import type { Country, ChoiceResult } from "@geobean/core";

interface ChoicesProps {
  choices: Country[];
  answered: boolean;
  choiceResult: ChoiceResult | null;
  eliminatedIds?: string[];
  // Label for each option — name for name/flag modes, capital for capital mode.
  label: (c: Country) => string;
  onPick: (c: Country) => void;
}

// Multiple-choice grid shared by the map (name) and expert (capital/flag)
// quizzes. Marks correct/wrong once answered and dims options eliminated by a
// hint. Reuses the .choices/.choice styling.
export function Choices({
  choices,
  answered,
  choiceResult,
  eliminatedIds = [],
  label,
  onPick,
}: ChoicesProps) {
  const eliminated = new Set(eliminatedIds);
  return (
    <div className="choices">
      {choices.map((c) => {
        let cls = "choice";
        const isEliminated = eliminated.has(c.id);
        if (answered && choiceResult) {
          if (c.id === choiceResult.correctId) cls += " correct";
          else if (c.id === choiceResult.pickedId) cls += " wrong";
        } else if (isEliminated) {
          cls += " eliminated";
        }
        return (
          <button
            key={c.id}
            className={cls}
            disabled={answered || isEliminated}
            onClick={() => onPick(c)}
          >
            {label(c)}
          </button>
        );
      })}
    </div>
  );
}
