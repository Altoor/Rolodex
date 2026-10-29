import { Button } from "#components/ui/button";
import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { useEffect, useState } from "react";
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
        optionDescriptions?: Array<string> | string | null | undefined;
      }
    | undefined;
  setValues: (variables: {
    instruction: string;
    decisionPremise: string;
    options: { name: string }[];
  }) => void;
}

const ScoreDecisionForm = ({ values, setValues }: ScoreDecisionFormProps) => {
  const { register } = useDebouncedFormState<Inputs>({
    fieldsToWatch: ["instruction", "decisionPremise"],
    valuesFromFields: (watched) => ({
      instruction: watched["instruction"] as string ?? "",
      decisionPremise: watched["decisionPremise"] as string ?? "",
      options: Array.from(options.entries()).map(([_, item]) => ({
        name: item.name,
      })),
    }),
    values,
    setValues,
  });
  const [options, setOptions] = useState(new Map<number, { name: string }>());

  // Load options from parent values when they change
  useEffect(() => {
    if (values) {
      const optionsMap = new Map();
      if (values.options) {
        (values.options as string[]).forEach((option, index) =>
          optionsMap.set(index, { name: option }),
        );
      }
      setOptions(optionsMap);
    }
  }, [values]);

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

                setOptions(newOptions);
              }}
              key={index}
            />
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
