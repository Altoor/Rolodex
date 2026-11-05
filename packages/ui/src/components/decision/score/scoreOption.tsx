"use client";

import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Item } from "#components/ui/item";
import { X } from "lucide-react";

import { useFormContext } from "react-hook-form";
import type { DecisionFormValues } from "../decision-form";

interface ScoreOptionProps {
  index: number;
  onDelete: () => void;
}

const ScoreOption = ({ index, onDelete }: ScoreOptionProps) => {
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
          <FieldLabel htmlFor={`score-option-${index}-name`}>Name</FieldLabel>
          <Input
            id={`score-option-${index}-name`}
            {...register(`options.${index}.name`, { required: true })}
          />
        </Field>
      </FieldGroup>
    </Item>
  );
};

export default ScoreOption;
