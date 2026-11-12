"use client";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "#components/ui/field";
import { Textarea } from "#components/ui/textarea";
import {
  suggestionsForConfig,
  type ToolStatePathSuggestion,
} from "#lib/toolStatePaths";
import { useMemo, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import PathFormField from "../../toolStatePaths/pathFormField";
import type { TaskFormValues } from "../../task-form";

interface ToolConfigFieldProps {
  /** Tools that read paths out of toolState opt into path assistance. */
  pathAware?: boolean;
  suggestions?: ToolStatePathSuggestion[];
  description?: ReactNode;
}

const ToolConfigField = ({
  pathAware = false,
  suggestions = [],
  description,
}: ToolConfigFieldProps) => {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<TaskFormValues>();
  const configText = useWatch({ control, name: "toolConfigText" });

  const mergedSuggestions = useMemo(
    () =>
      pathAware ? suggestionsForConfig(suggestions, configText ?? "") : [],
    [pathAware, suggestions, configText],
  );

  if (!pathAware) {
    return (
      <Field>
        <FieldLabel htmlFor="task-tool-config">Tool config (JSON)</FieldLabel>
        <Textarea
          id="task-tool-config"
          placeholder='Optional JSON, for example {"id": 3, "done": true}.'
          {...register("toolConfigText")}
        />
        <FieldDescription>
          Optional JSON. The queued task state is also passed to the tool.
        </FieldDescription>
        <FieldError errors={[errors.toolConfigText]} />
      </Field>
    );
  }

  return (
    <PathFormField
      name="toolConfigText"
      label="Tool config (JSON)"
      suggestions={mergedSuggestions}
      placeholder='For example { "path": "todos.0.name" }'
      textarea
      className="min-h-40 font-mono text-xs"
      error={errors.toolConfigText}
      description={
        <>
          Drag a tool-state value into the JSON, or click a badge to insert it
          at the cursor. Typed paths use the same colour as their badge.
          {description ? <> {description}</> : null}
        </>
      }
      emptyHint="No earlier tasks in this flow add tool-state values yet."
    />
  );
};

export default ToolConfigField;
