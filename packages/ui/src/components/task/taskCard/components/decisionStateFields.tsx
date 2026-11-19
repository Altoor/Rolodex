"use client";

import { Button } from "#components/ui/button";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import {
  Select,
  SelectContent,
  SelectController,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import type { ToolStatePathSuggestion } from "#lib/toolStatePaths";
import { Plus, X } from "lucide-react";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";
import type { DecisionStateMode, TaskFormValues } from "../../task-form";
import { PathTextControl } from "../../toolStatePaths/pathTextControl";

const MODES: { value: DecisionStateMode; label: string }[] = [
  { value: "none", label: "None" },
  { value: "all", label: "All tool state" },
  { value: "paths", label: "Selected paths" },
];

interface DecisionStateFieldsProps {
  suggestions: ToolStatePathSuggestion[];
}

/**
 * Controls which accumulated toolState values are appended to the decision
 * model's prompt. The run's state and toolState are not changed.
 */
const DecisionStateFields = ({ suggestions }: DecisionStateFieldsProps) => {
  const { control } = useFormContext<TaskFormValues>();
  const mode = useWatch({ control, name: "decisionStateMode" });
  const { fields, append, remove } = useFieldArray({
    control,
    name: "decisionStatePaths",
  });

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <Field>
        <FieldLabel>Decision model context</FieldLabel>
        <SelectController
          name="decisionStateMode"
          control={control}
          defaultValue="none"
        >
          {(value, onChange) => (
            <Select value={value ?? "none"} onValueChange={onChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      {mode.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          )}
        </SelectController>
        <FieldDescription>
          Add accumulated tool output to the state sent to the decision model.
          This only changes the model prompt; the run state passed to other
          tasks is unchanged.
        </FieldDescription>
      </Field>

      {mode === "paths" ? (
        <DecisionStatePathList
          fields={fields}
          suggestions={suggestions}
          onAdd={() => append({ path: "" })}
          onRemove={(index) => remove(index)}
        />
      ) : null}
    </div>
  );
};

interface DecisionStatePathListProps {
  fields: { id: string }[];
  suggestions: ToolStatePathSuggestion[];
  onAdd: () => void;
  onRemove: (index: number) => void;
}

const DecisionStatePathList = ({
  fields,
  suggestions,
  onAdd,
  onRemove,
}: DecisionStatePathListProps) => {
  const { control } = useFormContext<TaskFormValues>();

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium text-muted-foreground">
        Paths into earlier tool output
      </span>
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Add a dot path such as <code className="font-mono">file.path</code> or{" "}
          <code className="font-mono">files.0.name</code>.
        </p>
      ) : null}
      {fields.map((field, index) => (
        <div key={field.id} className="flex flex-col gap-1">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <Controller
                control={control}
                name={`decisionStatePaths.${index}.path`}
                render={({ field: pathField }) => (
                  <PathTextControl
                    value={pathText(pathField.value)}
                    onChange={pathField.onChange}
                    suggestions={suggestions}
                    placeholder="file.path or files.0.name"
                    collapseSuggestions
                  />
                )}
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Remove path"
              aria-label="Remove path"
              onClick={() => onRemove(index)}
            >
              <X />
            </Button>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-min"
        onClick={onAdd}
      >
        <Plus />
        Add path
      </Button>
    </div>
  );
};

function pathText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export default DecisionStateFields;
