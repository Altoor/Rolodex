"use client";

import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { useId, useState } from "react";

interface ToolConfigNumberControlProps {
  name: string;
  value?: number;
  description?: string;
  onChange: (value: number) => void;
  onClear: () => void;
}

/** One schema-driven numeric config setting. Empty means unset. */
export function ToolConfigNumberControl({
  name,
  value,
  description,
  onChange,
  onClear,
}: ToolConfigNumberControlProps) {
  const id = useId();
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [lastValue, setLastValue] = useState(value);

  // Keep the draft text when it already represents the new value, so typing
  // "0." or "1e3" is not rewritten mid-edit.
  if (value !== lastValue) {
    setLastValue(value);
    if (!(text.trim() !== "" && Number(text) === value)) {
      setText(value === undefined ? "" : String(value));
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor={id} className="font-mono text-sm">
        {name}
      </FieldLabel>
      <Input
        id={id}
        type="number"
        step="any"
        value={text}
        placeholder="Tool default"
        onChange={(event) => {
          const next = event.target.value;
          setText(next);

          if (!next.trim()) {
            onClear();
            return;
          }

          const parsed = Number(next);
          if (Number.isFinite(parsed)) onChange(parsed);
        }}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}
