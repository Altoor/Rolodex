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
import { USE_USER_DEFAULT_MODEL } from "../../../task-form";
import { useId } from "react";

interface ToolConfigModelControlProps {
  name: string;
  value?: string;
  models: string[];
  description?: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

/** One model config setting, rendered as a select of installed models. */
export function ToolConfigModelControl({
  name,
  value,
  models,
  description,
  onChange,
  onClear,
}: ToolConfigModelControlProps) {
  const id = useId();
  const options =
    value && value !== USE_USER_DEFAULT_MODEL && !models.includes(value)
      ? [...models, value]
      : models;

  return (
    <Field>
      <FieldLabel htmlFor={id} className="font-mono text-sm">
        {name}
      </FieldLabel>
      <Select
        value={value ?? USE_USER_DEFAULT_MODEL}
        onValueChange={(next) => {
          if (next === USE_USER_DEFAULT_MODEL) {
            onClear();
            return;
          }
          if (typeof next === "string") onChange(next);
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Use inherited model" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={USE_USER_DEFAULT_MODEL}>
              Use inherited model
            </SelectItem>
            {options.map((model) => (
              <SelectItem key={model} value={model}>
                {model}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}
