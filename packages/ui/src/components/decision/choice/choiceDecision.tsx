"use client";

import { Button } from "#components/ui/button";
import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Plus } from "lucide-react";
import { useFieldArray, useFormContext } from "react-hook-form";
import ChoiceOption from "./choiceOption";
import type { DecisionFormValues } from "../decision-form";

const ChoiceDecisionForm = () => {
  const { register, control } = useFormContext<DecisionFormValues>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: "options",
  });

  return (
    <div className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="choice-instruction">
            What is your current instruction?
          </FieldLabel>
          <Input
            id="choice-instruction"
            {...register("instruction", { required: true })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="choice-premise">
            What is the premise of the decision?
          </FieldLabel>
          <Input
            id="choice-premise"
            {...register("decisionPremise", { required: true })}
          />
        </Field>
      </FieldGroup>
      <div className="flex flex-row flex-wrap gap-2">
        {fields.map((field, index) => (
          <ChoiceOption
            key={field.id}
            index={index}
            onDelete={() => remove(index)}
          />
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

export default ChoiceDecisionForm;
