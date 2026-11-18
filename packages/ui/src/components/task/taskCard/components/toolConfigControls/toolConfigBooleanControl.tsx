"use client";

import { Checkbox } from "#components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "#components/ui/field";
import { useId } from "react";

interface ToolConfigBooleanControlProps {
  name: string;
  checked: boolean;
  description?: string;
  onChange: (checked: boolean) => void;
}

/** One schema-driven boolean config setting, rendered as a checkbox. */
export function ToolConfigBooleanControl({
  name,
  checked,
  description,
  onChange,
}: ToolConfigBooleanControlProps) {
  const id = useId();

  return (
    <Field orientation="horizontal">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onChange(next === true)}
      />
      <FieldContent>
        <FieldLabel htmlFor={id} className="font-mono text-sm">
          {name}
        </FieldLabel>
        {description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : null}
      </FieldContent>
    </Field>
  );
}
