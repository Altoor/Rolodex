"use client";

import { Button } from "#components/ui/button";

import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { useForm } from "react-hook-form";
import { Input } from "#components/ui/input";
import { useCallback, useEffect, useState } from "react";
import ChoiceOption from "./choiceOption";
import { Plus } from "lucide-react";
import { debounce } from "#lib/debounce";

type Inputs = {
  instruction: string;
  decisionPremise: string;
};

interface choiceDecisionFormProps {
  values:
    | {
        instruction: string;
        decisionPremise: string;
        options: { name: string; description: string }[] | null;
      }
    | undefined;
  setValues: (variables: {
    instruction: string;
    decisionPremise: string;
    options: { name: string; description: string }[];
  }) => void;
}

const ChoiceDecisionForm = ({ values, setValues }: choiceDecisionFormProps) => {
  const { register, watch } = useForm<Inputs>();
  const [options, setOptions] = useState(
    new Map<number, { name: string; description: string }>(),
  );

  const debouncedSetValues = useCallback(
    (variables: {
      instruction: string;
      decisionPremise: string;
      options: { name: string; description: string }[];
    }) => {
      debounce(() => {
        setValues(variables);
      }, 500)();
    },
    [setValues],
  );

  useEffect(() => {
    watch(({ instruction, decisionPremise }) => {
      const currentValues = {
        instruction: instruction ?? "",
        decisionPremise: decisionPremise ?? "",
        options: Array.from(options.entries()).map(([_, item]) => ({
          name: item.name,
          description: item.description,
        })),
      };

      debouncedSetValues(currentValues);
    });
  }, [watch, debouncedSetValues, options]);

  useEffect(() => {
    if (values) {
      setFormValues(
        {
          instruction: values.instruction,
          decisionPremise: values.decisionPremise,
        },
        {
          shouldDirty: false,
          shouldValidate: false,
        },
      );

      const optionsMap = new Map();
      if (values.options) {
        values.options.forEach((option, index) =>
          optionsMap.set(index, {
            name: option.name,
            description: option.description,
          }),
        );
      }
      setOptions(optionsMap);
    }
  }, [setFormValues, values]);

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
            <ChoiceOption
              defaultValues={option}
              setValues={(values) => {
                const newOptions = new Map(options);

                const changedOption = newOptions.get(index);

                if (changedOption) {
                  changedOption.name = values.name;
                  changedOption.description = values.description;
                  newOptions.set(index, changedOption);
                }

                debounce(() => {
                  setOptions(newOptions);
                }, 500)();
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
      </FieldGroup>
    </form>
  );
};

export default ChoiceDecisionForm;
