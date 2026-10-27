"use client";

import { Button } from "#components/ui/button";

import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { useForm } from "react-hook-form";
import { Input } from "#components/ui/input";
import { useCallback, useEffect, useState } from "react";
import ScoreOption from "./scoreOption";
import { Plus } from "lucide-react";
import { debounce } from "#lib/debounce";

type Inputs = {
  instruction: string;
  decisionPremise: string;
};

interface scoreDecisionFormProps {
  values: {
    variables: {
      instruction: string;
      decisionPremise: string;
      options: { name: string }[];
    };
  };
  setValues: (variables: {
    instruction: string;
    decisionPremise: string;
    options: { name: string }[];
  }) => void;
}

const ScoreDecisionForm = ({ values, setValues }: scoreDecisionFormProps) => {
  const { register, watch } = useForm<Inputs>();
  const [options, setOptions] = useState(new Map<number, { name: string }>());

  const debouncedSetValues = useCallback(
    (variables: {
      instruction: string;
      decisionPremise: string;
      options: { name: string }[];
    }) => {
      debounce(() => {
        setValues(variables);
      }, 500)();
    },
    [watch("instruction"), watch("decisionPremise"), options, setOptions],
  );

  useEffect(() => {
    const currentValues = {
      instruction: watch("instruction"),
      decisionPremise: watch("decisionPremise"),
      options: Array.from(options.entries()).map(([_, item]) => ({
        name: item.name,
      })),
    };
    debouncedSetValues(currentValues);
  }, [watch, options, setOptions, debouncedSetValues]);

  return (
    <form>
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

        <div className="flex flex-row flex-wrap gap-2">
          {Array.from(options.entries()).map(([index, option]) => (
            <ScoreOption
              defaultValues={option}
              setValues={(values) => {
                const newOptions = new Map(options);

                const changedOption = newOptions.get(index);

                if (changedOption) {
                  changedOption.name = values.name;
                  newOptions.set(index, changedOption);
                }

                debounce(() => {
                  setOptions(newOptions);
                }, 500)();
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
      </FieldGroup>
    </form>
  );
};

export default ScoreDecisionForm;
