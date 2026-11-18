"use client";

import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { useId } from "react";

interface ToolConfigEnumControlProps {
  name: string;
  value?: string;
  values: string[];
  description?: string;
  onChange: (value: string) => void;
}

/** One schema-driven enum config setting, rendered as a select. */
export function ToolConfigEnumControl({
  name,
  value,
  values,
  description,
  onChange,
}: ToolConfigEnumControlProps) {
  const id = useId();

  return (
    <Field>
      <FieldLabel htmlFor={id} className="font-mono text-sm">
        {name}
      </FieldLabel>
      <Select
        value={value}
        onValueChange={(next) => {
          if (typeof next === "string") onChange(next);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Use tool default" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {values.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}
