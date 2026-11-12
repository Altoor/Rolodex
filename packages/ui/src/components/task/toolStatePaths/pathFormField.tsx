"use client";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "#components/ui/field";
import type { ToolStatePathSuggestion } from "#lib/toolStatePaths";
import { useId, type ReactNode } from "react";
import { Controller, useFormContext, type FieldPath } from "react-hook-form";
import type { TaskFormValues } from "../task-form";
import { PathTextControl } from "./pathTextControl";

interface PathFormFieldProps {
  name: FieldPath<TaskFormValues>;
  label: string;
  suggestions: ToolStatePathSuggestion[];
  description?: ReactNode;
  placeholder?: string;
  textarea?: boolean;
  className?: string;
  id?: string;
  error?: { message?: string };
  emptyHint?: string;
}

/**
 * Form field for any value that can reference an earlier toolState path.
 * Renders path badges underneath and colours paths typed into the field.
 */
const PathFormField = ({
  name,
  label,
  suggestions,
  description,
  placeholder,
  textarea = false,
  className,
  id,
  error,
  emptyHint,
}: PathFormFieldProps) => {
  const { control } = useFormContext<TaskFormValues>();
  const generatedId = useId();
  const inputId = id ?? `path-field-${generatedId}`;

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <PathTextControl
            id={inputId}
            value={typeof field.value === "string" ? field.value : ""}
            onChange={field.onChange}
            suggestions={suggestions}
            textarea={textarea}
            placeholder={placeholder}
            className={className}
            invalid={Boolean(error)}
          />
        )}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {suggestions.length === 0 && emptyHint ? (
        <p className="text-xs text-muted-foreground">{emptyHint}</p>
      ) : null}
      <FieldError errors={[error]} />
    </Field>
  );
};

export default PathFormField;
