"use client";

import { Button } from "#components/ui/button";
import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { useEffect, useRef, useState } from "react";
import ScoreOption from "./scoreOption";
import { Plus } from "lucide-react";
import { useDebouncedFormState } from "#hooks/useDebouncedFormState";

type Inputs = {
  instruction: string;
  decisionPremise: string;
};

interface ScoreDecisionFormProps {
  values:
    | {
        decisionPremise: string;
        instruction: string;
        options?: Array<string> | string | null | undefined;
      }
    | undefined;
  setValues: (variables: {
    instruction: string;
    decisionPremise: string;
    options: { name: string }[];
  }) => void;
}

const ScoreDecisionForm = ({ values, setValues }: ScoreDecisionFormProps) => {
  const [options, setOptions] = useState(new Map<number, { name: string }>());
  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Tracks whether the last values change came from our own setValues call.
  const isLocalChange = useRef(false);
  const valuesRef = useRef(values);
  const setValuesRef = useRef(setValues);
  valuesRef.current = values;
  setValuesRef.current = setValues;

  const { register } = useDebouncedFormState<Inputs>({
    fieldsToWatch: ["instruction", "decisionPremise"],
    valuesFromFields: (watched) => ({
      instruction: (watched["instruction"] as string) ?? "",
      decisionPremise: (watched["decisionPremise"] as string) ?? "",
      options: Array.from(optionsRef.current.values()),
    }),
    values,
    setValues,
  });

  // Load options from parent values when they change externally.
  useEffect(() => {
    if (isLocalChange.current) {
      isLocalChange.current = false;
      return;
    }
    if (values?.options) {
      const newOptions = (values.options as string[]).map((name) => ({
        name,
      }));

      // Compare with current options to skip unnecessary re-sets
      const current = Array.from(optionsRef.current.values());
      const isSame =
        newOptions.length === current.length &&
        newOptions.every(
          (opt, i) => current[i] && opt.name === current[i].name,
        );

      if (!isSame) {
        const optionsMap = new Map<number, { name: string }>();
        newOptions.forEach((opt, index) => optionsMap.set(index, opt));
        setOptions(optionsMap);
      }
    }
  }, [values]);

  // Update local options and sync to parent in one step
  const updateAndSync = (newOptionsMap: Map<number, { name: string }>) => {
    isLocalChange.current = true;
    setOptions(newOptionsMap);

    const v = valuesRef.current;
    setValuesRef.current({
      instruction: v?.instruction ?? "",
      decisionPremise: v?.decisionPremise ?? "",
      options: Array.from(newOptionsMap.values()),
    });
  };

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
              values={option}
              setValues={(optionValues) => {
                const newOptions = new Map(optionsRef.current);
                newOptions.set(index, optionValues);
                updateAndSync(newOptions);
              }}
              onDelete={() => {
                const newOptions = new Map(optionsRef.current);
                newOptions.delete(index);
                updateAndSync(newOptions);
              }}
              key={index}
            ></ScoreOption>
          ))}
        </div>
        <Button
          className="w-min"
          onClick={() => {
            const newOptions = new Map(optionsRef.current);
            const nextKey =
              newOptions.size === 0 ? 0 : Math.max(...newOptions.keys()) + 1;
            newOptions.set(nextKey, { name: "" });
            updateAndSync(newOptions);
          }}
        >
          <Plus />
        </Button>
      </FieldGroup>
    </form>
  );
};

export default ScoreDecisionForm;
