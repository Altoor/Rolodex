"use client";

import { Button } from "#components/ui/button";
import { Checkbox } from "#components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "#components/ui/field";
import { X } from "lucide-react";
import { useId } from "react";

interface ToolConfigBooleanControlProps {
  name: string;
  checked: boolean;
  /** True when the key is explicitly present in the JSON. */
  isSet: boolean;
  description?: string;
  onChange: (checked: boolean) => void;
  onClear: () => void;
}

/** One schema-driven boolean config setting, rendered as a checkbox. */
export function ToolConfigBooleanControl({
  name,
  checked,
  isSet,
  description,
  onChange,
  onClear,
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
        <div className="flex items-center justify-between gap-2">
          <FieldLabel htmlFor={id} className="font-mono text-sm">
            {name}
          </FieldLabel>
          {isSet ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Unset ${name} and use the tool default`}
              title="Unset and use the tool default"
              onClick={onClear}
            >
              <X />
            </Button>
          ) : null}
        </div>
        {description ? (
          <FieldDescription>{description}</FieldDescription>
        ) : null}
      </FieldContent>
    </Field>
  );
}
