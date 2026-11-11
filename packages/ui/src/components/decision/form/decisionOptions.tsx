"use client";

import { Button } from "#components/ui/button";
import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Item } from "#components/ui/item";
import { Textarea } from "#components/ui/textarea";
import { Plus, X } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";
import type { DecisionFormValues } from "../decision-form";

interface DecisionOptionsProps {
  /** Prefix for the input ids so multiple option lists stay unique. */
  idPrefix: string;
  /** Choice decisions score each option description too. */
  withDescriptions?: boolean;
}

const DecisionOptions = ({
  idPrefix,
  withDescriptions = false,
}: DecisionOptionsProps) => {
  const { register, control } = useFormContext<DecisionFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "options",
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row flex-wrap gap-2">
        {fields.map((field, index) => (
          <Item
            key={field.id}
            variant="outline"
            className="relative w-full max-w-60"
          >
            <button
              type="button"
              className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
              onClick={() => remove(index)}
              title="Remove option"
              aria-label="Remove option"
            >
              <X className="size-4" />
            </button>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${idPrefix}-option-${index}-name`}>
                  Name
                </FieldLabel>
                <Input
                  id={`${idPrefix}-option-${index}-name`}
                  {...register(`options.${index}.name`, { required: true })}
                />
              </Field>
              {withDescriptions ? (
                <Field>
                  <FieldLabel
                    htmlFor={`${idPrefix}-option-${index}-description`}
                  >
                    Description
                  </FieldLabel>
                  <Textarea
                    id={`${idPrefix}-option-${index}-description`}
                    {...register(`options.${index}.description`, {
                      required: true,
                    })}
                  />
                </Field>
              ) : null}
            </FieldGroup>
          </Item>
        ))}
      </div>
      <Button
        type="button"
        className="w-min"
        onClick={() => append({ name: "", description: "" })}
        title="Add option"
        aria-label="Add option"
      >
        <Plus />
      </Button>
    </div>
  );
};

export default DecisionOptions;
