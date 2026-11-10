"use client";

import { Button } from "#components/ui/button";
import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Item, ItemActions, ItemContent } from "#components/ui/item";
import {
  Select,
  SelectContent,
  SelectController,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { ConfirmButton } from "#components/feedback/confirm-button";
import { parseNullableNumber } from "#lib/numbers";
import { Save, X } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import type { TaskFormValues } from "../task-form";

interface TaskResultOptionProps {
  index: number;
  options: string[];
  onDelete: () => void;
  onSave: () => void;
}

const TaskResultOption = ({
  index,
  options,
  onDelete,
  onSave,
}: TaskResultOptionProps) => {
  const { register, control, setValue } = useFormContext<TaskFormValues>();
  const type = useWatch({ control, name: `taskResults.${index}.type` });
  const confidenceValue = useWatch({
    control,
    name: `taskResults.${index}.confidenceThreshold`,
  });
  const hasConfidence =
    confidenceValue != null && String(confidenceValue).trim() !== "";

  return (
    <Item variant="outline" className="relative w-full max-w-60">
      <ConfirmButton
        title="Delete result"
        className="absolute right-2 top-2"
        onConfirm={onDelete}
      >
        <X className="size-4" />
      </ConfirmButton>
      <ItemContent>
        <ItemActions>
          <Button
            type="button"
            onClick={onSave}
            title="Save result"
            aria-label="Save result"
          >
            <Save />
          </Button>
        </ItemActions>
      </ItemContent>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`task-result-${index}-confidence`}>
            Confidence threshold
          </FieldLabel>
          <div className="flex items-center gap-1">
            <Input
              id={`task-result-${index}-confidence`}
              type="number"
              step="any"
              {...register(`taskResults.${index}.confidenceThreshold`, {
                setValueAs: parseNullableNumber,
              })}
            />
            {hasConfidence ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                title="Remove confidence threshold"
                aria-label="Remove confidence threshold"
                onClick={() =>
                  setValue(`taskResults.${index}.confidenceThreshold`, null)
                }
              >
                <X className="size-4 text-muted-foreground" />
              </Button>
            ) : null}
          </div>
        </Field>

        {type === "score" ? (
          <Field>
            <FieldLabel htmlFor={`task-result-${index}-score`}>
              Score threshold
            </FieldLabel>
            <Input
              id={`task-result-${index}-score`}
              type="number"
              step="any"
              {...register(`taskResults.${index}.scoreThreshold`, {
                setValueAs: parseNullableNumber,
                required: true,
              })}
            />
          </Field>
        ) : null}

        {type === "choice" ? (
          <>
            <Field>
              <FieldLabel htmlFor={`task-result-${index}-option`}>
                Option
              </FieldLabel>
              <SelectController
                name={`taskResults.${index}.option`}
                control={control}
                defaultValue={options[0]}
              >
                {(value, onChange) => (
                  <Select value={value} onValueChange={onChange}>
                    <SelectTrigger
                      id={`task-result-${index}-option`}
                      className="w-(--size-select-sm)"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              </SelectController>
            </Field>

            <Field>
              <FieldLabel htmlFor={`task-result-${index}-probability`}>
                Probability threshold
              </FieldLabel>
              <Input
                id={`task-result-${index}-probability`}
                type="number"
                step="any"
                {...register(`taskResults.${index}.probabilityThreshold`, {
                  setValueAs: parseNullableNumber,
                  required: true,
                })}
              />
            </Field>
          </>
        ) : null}
      </FieldGroup>
    </Item>
  );
};

export default TaskResultOption;
