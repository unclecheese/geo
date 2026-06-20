"use client";

import { useEffect, useRef, useState } from "react";
import { Logic } from "@/lib/logic";

interface AutocompleteProps {
  candidates: string[];
  onSubmit: (value: string) => void;
}

// Typed answer with a filtered suggestion list. onSubmit(value) fires on Enter,
// clicking a suggestion, or Submit; Skip submits "". Ported from _buildAutocomplete.
export function Autocomplete({ candidates, onSubmit }: AutocompleteProps) {
  const [value, setValue] = useState("");
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = Logic.suggest(value, candidates, 6);
  const listOpen = items.length > 0;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const submit = (val: string) => {
    onSubmit(val);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (items.length) setActive((a) => (a + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (items.length) setActive((a) => (a - 1 + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      submit(active >= 0 && items[active] ? items[active] : value);
    }
  };

  return (
    <>
      <div className="ac">
        <input
          ref={inputRef}
          className="ac-input"
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="Type your answer…"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="ac-list" hidden={!listOpen}>
          {items.map((c, i) => (
            <div
              key={c}
              className={"ac-opt" + (i === active ? " active" : "")}
              onMouseDown={(e) => {
                // mousedown so the click lands before input blur swallows it
                e.preventDefault();
                submit(c);
              }}
            >
              {c}
            </div>
          ))}
        </div>
      </div>
      <div className="map-actions">
        <button className="btn ghost" onClick={() => submit("")}>
          Skip
        </button>
        <button className="btn" onClick={() => submit(value)}>
          Submit
        </button>
      </div>
    </>
  );
}
