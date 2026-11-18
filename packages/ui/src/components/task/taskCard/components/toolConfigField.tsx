"use client";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "#components/ui/field";
import { Textarea } from "#components/ui/textarea";
import { parseConfigObject, toolConfigControls } from "#lib/toolConfigControls";
import {
  suggestionsForConfig,
  type ToolStatePathSuggestion,
} from "#lib/toolStatePaths";
import { useMemo, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import PathFormField from "../../toolStatePaths/pathFormField";
import type { TaskFormValues } from "../../task-form";
import { ToolConfigControls } from "./toolConfigControls/toolConfigControls";

interface ToolConfigFieldProps {
  /** Tools that read paths out of toolState opt into path assistance. */
  pathAware?: boolean;
  suggestions?: ToolStatePathSuggestion[];
  description?: ReactNode;
  /** Tool input schema used to derive boolean and enum settings. */
  inputSchema?: unknown;
  /** Schema properties that a dedicated editor already edits. */
  excludedProperties?: readonly string[];
}

const ToolConfigField = ({
  pathAware = false,
  suggestions = [],
  description,
  inputSchema,
  excludedProperties,
}: ToolConfigFieldProps) => {
  const {
    control,
    register,
    setValue,
    formState: { errors },
  } = useFormContext<TaskFormValues>();
  const configText = useWatch({ control, name: "toolConfigText" });
  const config = useMemo(() => parseConfigObject(configText), [configText]);

  const controls = useMemo(
    () => toolConfigControls(inputSchema, excludedProperties),
    [inputSchema, excludedProperties],
  );

  const mergedSuggestions = useMemo(
    () =>
      pathAware ? suggestionsForConfig(suggestions, configText ?? "") : [],
    [pathAware, suggestions, configText],
  );

  const controlsNode =
    config && controls.length > 0 ? (
      <ToolConfigControls
        controls={controls}
        config={config}
        onChange={(key, value) => {
          setValue(
            "toolConfigText",
            JSON.stringify({ ...config, [key]: value }, null, 2),
            { shouldDirty: true },
          );
        }}
      />
    ) : null;

  if (!pathAware) {
    return (
      <Field>
        <FieldLabel htmlFor="task-tool-config">Tool config (JSON)</FieldLabel>
        {controlsNode}
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
      beforeControl={controlsNode}
      description={
        <>
          Drag a tool-state value into the JSON, or click a badge to insert it
          at the cursor. Typed paths use the same colour as their badge. Wrap a
          path in double braces, for example{" "}
          <code className="font-mono text-xs">{"{{description}}"}</code>, to
          interpolate it when the tool runs.
          {description ? <> {description}</> : null}
        </>
      }
      emptyHint="No earlier tasks in this flow add tool-state values yet."
    />
  );
};

export default ToolConfigField;
