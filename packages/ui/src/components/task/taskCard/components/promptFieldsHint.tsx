import { useMemo } from "react";
import { FieldDescription } from "#components/ui/field";
import { promptFieldNamesFromText } from "#lib/toolStatePaths";
import { useFormContext, useWatch } from "react-hook-form";
import type { TaskFormValues } from "../../task-form";

export function PromptFieldsHint() {
  const { control } = useFormContext<TaskFormValues>();
  const configText = useWatch({ control, name: "toolConfigText" });
  const fieldNames = useMemo(
    () => promptFieldNamesFromText(configText ?? ""),
    [configText],
  );

  return (
    <FieldDescription>
      Prompt uses the generation model. Leave it empty to use your default.{" "}
      {fieldNames.length > 0 ? (
        <>
          <code className="font-mono">fields</code> publishes these downstream
          tool-state paths:{" "}
          {fieldNames.map((name, index) => (
            <span key={name}>
              {index > 0 ? ", " : null}
              <code className="font-mono">{name}</code>
            </span>
          ))}
          .
        </>
      ) : (
        <>
          Add a <code className="font-mono">fields</code> object to publish
          named values such as <code className="font-mono">name</code> or{" "}
          <code className="font-mono">description</code> for later tasks.
        </>
      )}
    </FieldDescription>
  );
}
