"use client";

import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import type { ToolStatePathSuggestion } from "#lib/toolStatePaths";
import { useId } from "react";
import { PathTextControl } from "../../../toolStatePaths/pathTextControl";

interface ToolConfigPathControlProps {
  name: string;
  value?: string;
  suggestions: ToolStatePathSuggestion[];
  description?: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

/** One path config setting with tool-state badges and highlighting. */
export function ToolConfigPathControl({
  name,
  value,
  suggestions,
  description,
  onChange,
  onClear,
}: ToolConfigPathControlProps) {
  const id = useId();

  return (
    <Field>
      <FieldLabel htmlFor={id} className="font-mono text-sm">
        {name}
      </FieldLabel>
      <PathTextControl
        id={id}
        value={value ?? ""}
        suggestions={suggestions}
        placeholder="Optional path, for example todos.0.name"
        onChange={(next) => {
          if (next.trim()) {
            onChange(next);
          } else {
            onClear();
          }
        }}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}
