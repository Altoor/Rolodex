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

const TOOL_DEFAULT = "__tool_default__";

interface ToolConfigEnumControlProps {
  name: string;
  value?: string;
  values: string[];
  /** Schema default, shown in the unset option for context. */
  defaultValue?: string;
  description?: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

/** One schema-driven enum config setting, rendered as a select. */
export function ToolConfigEnumControl({
  name,
  value,
  values,
  defaultValue,
  description,
  onChange,
  onClear,
}: ToolConfigEnumControlProps) {
  const id = useId();
  const options =
    value && value !== TOOL_DEFAULT && !values.includes(value)
      ? [...values, value]
      : values;

  return (
    <Field>
      <FieldLabel htmlFor={id} className="font-mono text-sm">
        {name}
      </FieldLabel>
      <Select
        value={value ?? TOOL_DEFAULT}
        onValueChange={(next) => {
          if (next === TOOL_DEFAULT) {
            onClear();
            return;
          }
          if (typeof next === "string") onChange(next);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Use tool default" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={TOOL_DEFAULT}>
              Use tool default
              {defaultValue !== undefined ? ` (${defaultValue})` : ""}
            </SelectItem>
            {options.map((option) => (
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
