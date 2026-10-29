import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { useDebouncedFormState } from "#hooks/useDebouncedFormState";

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
  const { register } = useDebouncedFormState<Inputs>({
    fieldsToWatch: ["instruction", "decisionPremise"],
    valuesFromFields: (watched) => ({
      instruction: watched["instruction"] as string ?? "",
      decisionPremise: watched["decisionPremise"] as string ?? "",
    }),
    values,
    setValues,
  });

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
      </FieldGroup>
    </form>
  );
};

export default NoulDecisionForm;
