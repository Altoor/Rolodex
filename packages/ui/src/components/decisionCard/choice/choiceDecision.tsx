"use client";

import { Button } from "#components/ui/button";

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#components/ui/field";
import { SubmitHandler, useForm } from "react-hook-form";
import { Input } from "#components/ui/input";
import { Spinner } from "#components/ui/spinner";
import { ErrorLike } from "@apollo/client";
import { useState } from "react";
import ChoiceOption from "./choiceOption";
import { Plus } from "lucide-react";

type Inputs = {
  instruction: string;
  state: string;
  decisionPremise: string;
};

interface choiceDecisionFormProps {
  promptSubmit: (variables: {
    instruction: string;
    state: string;
    decisionPremise: string;
    options: { name: string; description: string }[];
  }) => void;
  loading: boolean;
  error: ErrorLike | undefined;
}

const ChoiceDecisionForm = ({
  promptSubmit,
  loading,
  error,
}: choiceDecisionFormProps) => {
  const { register, handleSubmit, getValues } = useForm<Inputs>();
  const [options, setOptions] = useState(
    new Map<number, { name: string; description: string }>(),
  );

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    promptSubmit({
      instruction: inputs.instruction,
      state: inputs.state,
      decisionPremise: inputs.decisionPremise,
      options: Array.from(options.entries()).map(([index, item]) => {
        return { name: item.name, description: item.description };
      }),
    });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="instruction">
            What is your current instruction
          </FieldLabel>
          <Input {...register("instruction", { required: true })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="decisionPremise">
            What is the premise of the decision
          </FieldLabel>
          <Input {...register("decisionPremise", { required: true })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="state">What is your current state</FieldLabel>
          <Input {...register("state", { required: true })} />
        </Field>
        <div className="flex flex-row flex-wrap gap-2">
          {Array.from(options.entries()).map(([index, option]) => (
            <ChoiceOption
              defaultValues={option}
              setValues={(values) => {
                const changedOption = options.get(index);

                if (changedOption) {
                  changedOption.name = values.name;

                  changedOption.description = values.description;
                  options.set(index, changedOption);
                }

                setOptions(options);
              }}

              key={index}
            ></ChoiceOption>
          ))}
        </div>
        <Button
          className="w-min"

          onClick={() => {
            const newIndex = options.size;
            const newOption = { name: "", description: "" };
            const newOptionsMap = new Map(options);
            newOptionsMap.set(newIndex, newOption);
            setOptions(newOptionsMap);
          }}
        >
          <Plus></Plus>
        </Button>
        <Field>
          <FieldError errors={[error]}></FieldError>
          <Button type="submit">{loading ? <Spinner /> : "Submit"}</Button>
        </Field>
      </FieldGroup>
    </form>
  );
};

export default ChoiceDecisionForm;
