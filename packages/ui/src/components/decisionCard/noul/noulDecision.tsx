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

type Inputs = {
  instruction: string;
  state: string;
  decisionPremise: string;
};

interface NoulDecisionFormProps {
  promptSubmit: (variables: {
    instruction: string;
    state: string;
    decisionPremise: string;
  }) => void;
  loading: boolean;
  error: ErrorLike | undefined;
}

const NoulDecisionForm = ({
  promptSubmit,
  loading,
  error,
}: NoulDecisionFormProps) => {
  const {
    register,
    handleSubmit,
    formState: { errors: formErrors },
  } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    promptSubmit({
      instruction: inputs.instruction,
      state: inputs.state,
      decisionPremise: inputs.decisionPremise,
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
        <Field>
          <FieldError errors={[error]}></FieldError>
          <Button type="submit">{loading ? <Spinner /> : "Submit"}</Button>
        </Field>
      </FieldGroup>
    </form>
  );
};

export default NoulDecisionForm;
