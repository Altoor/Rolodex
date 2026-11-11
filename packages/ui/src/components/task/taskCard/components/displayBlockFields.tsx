"use client";

import { Checkbox } from "#components/ui/checkbox";
import { Field, FieldLabel } from "#components/ui/field";
import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import type { TaskFormValues } from "../../task-form";

function parseConfig(text: string | undefined): Record<string, unknown> | null {
  if (!text?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * display_block can either show the whole selection or a single value. The
 * backend option is `select: "first"`; this keeps it discoverable without
 * hiding the raw JSON.
 */
const DisplayBlockFields = () => {
  const { control, setValue } = useFormContext<TaskFormValues>();
  const configText = useWatch({ control, name: "toolConfigText" });
  const config = useMemo(() => parseConfig(configText), [configText]);

  if (config === null) return null;

  const selectFirst = config.select === "first";

  const setSelectFirst = (checked: boolean) => {
    setValue(
      "toolConfigText",
      JSON.stringify({ ...config, select: checked ? "first" : "all" }, null, 2),
    );
  };

  return (
    <Field orientation="horizontal">
      <Checkbox
        checked={selectFirst}
        onCheckedChange={(checked) => setSelectFirst(checked === true)}
      />
      <div className="flex flex-col gap-0.5">
        <FieldLabel>Display one value only</FieldLabel>
        <p className="text-sm text-muted-foreground">
          Sets <span className="font-mono text-xs">"select": "first"</span>. Use
          a path that points at one value, for example{" "}
          <span className="font-mono text-xs">todo.name</span>, to show a single
          field.
        </p>
      </div>
    </Field>
  );
};

export default DisplayBlockFields;
