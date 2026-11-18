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
  /** Installed model names for model selects. */
  models?: string[];
  /** Tool input schema used to derive structured settings. */
  inputSchema?: unknown;
  /** Schema properties that a dedicated editor already edits. */
  excludedProperties?: readonly string[];
}

const ToolConfigField = ({
  pathAware = false,
  suggestions = [],
  description,
  models = [],
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

  const writeConfig = (next: Record<string, unknown>) => {
    setValue("toolConfigText", JSON.stringify(next, null, 2), {
      shouldDirty: true,
    });
  };

  const controlsNode =
    config && controls.length > 0 ? (
      <ToolConfigControls
        controls={controls}
        config={config}
        models={models}
        suggestions={mergedSuggestions}
        onChange={(key, value) => writeConfig({ ...config, [key]: value })}
        onClear={(key) => {
          const next = { ...config };
          delete next[key];
          writeConfig(next);
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
      wrapInTemplate
      description={
        <>
          Drag a tool-state value into the JSON, or click a badge to insert it
          at the cursor. Dropping inside a JSON string value wraps it as{" "}
          <code className="font-mono text-xs">{"{{path}}"}</code>; dropping
          elsewhere inserts the bare path. Typed templates use the same colour
          as their badge.
          {description ? <> {description}</> : null}
        </>
      }
      emptyHint="No earlier tasks in this flow add tool-state values yet."
    />
  );
};

export default ToolConfigField;
