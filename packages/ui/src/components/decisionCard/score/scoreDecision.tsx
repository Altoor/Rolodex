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
import ScoreOption from "./scoreOption";
import { Plus } from "lucide-react";

type Inputs = {
  instruction: string;
  state: string;
  decisionPremise: string;
};

interface scoreDecisionFormProps {
  promptSubmit: (variables: {
    instruction: string;
    state: string;
    decisionPremise: string;
    options: { name: string }[];
  }) => void;
  loading: boolean;
  error: ErrorLike | undefined;
}

const ScoreDecisionForm = ({
  promptSubmit,
  loading,
  error,
}: scoreDecisionFormProps) => {
  const { register, handleSubmit } = useForm<Inputs>();
  const [options, setOptions] = useState(new Map<number, { name: string }>());

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    promptSubmit({
      instruction: inputs.instruction,
      state: inputs.state,
      decisionPremise: inputs.decisionPremise,
      options: Array.from(options.entries()).map(([_, item]) => {
        return { name: item.name };
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
            <ScoreOption
              defaultValues={option}
              setValues={(values) => {
                const changedOption = options.get(index);

                if (changedOption) {
                  changedOption.name = values.name;

                  options.set(index, changedOption);
                }

                setOptions(options);
              }}

              key={index}
            ></ScoreOption>
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

export default ScoreDecisionForm;
