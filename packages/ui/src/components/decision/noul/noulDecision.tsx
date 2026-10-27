"use client";

import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { useForm } from "react-hook-form";
import { Input } from "#components/ui/input";
import { useCallback, useEffect } from "react";
import { debounce } from "#lib/debounce";

type Inputs = {
  instruction: string;
  decisionPremise: string;
};

interface NoulDecisionFormProps {
  values:
    | {
        instruction: string;
        decisionPremise: string;
      }
    | undefined;
  setValues: (variables: {
    instruction: string;
    decisionPremise: string;
  }) => void;
}

const NoulDecisionForm = ({ values, setValues }: NoulDecisionFormProps) => {
  const { register, watch } = useForm<Inputs>();

  const debouncedSetValues = useCallback(
    (variables: { instruction: string; decisionPremise: string }) => {
      debounce(() => {
        setValues(variables);
      }, 500)();
    },
    [],
  );

  useEffect(() => {
    watch(({ instruction, decisionPremise }) => {
      console.log(values);
      const currentValues = {
        instruction: instruction ?? values?.instruction ?? "",
        decisionPremise: decisionPremise ?? values?.decisionPremise ?? "",
      };

      debouncedSetValues(currentValues);
    });
  }, [watch, debouncedSetValues, values]);

  return (
    <form>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="instruction">
            What is your current instruction
          </FieldLabel>
          <Input
            defaultValue={values?.instruction}
            {...register("instruction", { required: true })}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="decisionPremise">
            What is the premise of the decision
          </FieldLabel>
          <Input
            defaultValue={values?.decisionPremise}
            {...register("decisionPremise", { required: true })}
          />
        </Field>
      </FieldGroup>
    </form>
  );
};

export default NoulDecisionForm;
