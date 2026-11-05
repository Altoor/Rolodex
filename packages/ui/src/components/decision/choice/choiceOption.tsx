"use client";

import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Item } from "#components/ui/item";
import { Textarea } from "#components/ui/textarea";
import { X } from "lucide-react";
import { useFormContext } from "react-hook-form";
import type { DecisionFormValues } from "../decision-form";

interface ChoiceOptionProps {
  index: number;
  onDelete: () => void;
}

const ChoiceOption = ({ index, onDelete }: ChoiceOptionProps) => {
  const { register } = useFormContext<DecisionFormValues>();

  return (
    <Item variant="outline" className="relative w-full max-w-60">
      <button
        type="button"
        className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        title="Remove option"
        aria-label="Remove option"
      >
        <X className="size-4" />
      </button>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`choice-option-${index}-name`}>Name</FieldLabel>
          <Input
            id={`choice-option-${index}-name`}
            {...register(`options.${index}.name`, { required: true })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`choice-option-${index}-description`}>
            Description
          </FieldLabel>
          <Textarea
            id={`choice-option-${index}-description`}
            {...register(`options.${index}.description`, { required: true })}
          />
        </Field>
      </FieldGroup>
    </Item>
  );
};

export default ChoiceOption;
