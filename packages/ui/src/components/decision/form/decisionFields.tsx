import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { useFormContext } from "react-hook-form";
import type { DecisionFormValues } from "../decision-form";

interface DecisionFieldsProps {
  /** Prefix for the input ids so multiple decision forms stay unique. */
  idPrefix: string;
}

const DecisionFields = ({ idPrefix }: DecisionFieldsProps) => {
  const { register } = useFormContext<DecisionFormValues>();

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-instruction`}>
          What is your current instruction?
        </FieldLabel>
        <Input
          id={`${idPrefix}-instruction`}
          {...register("instruction", { required: true })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-premise`}>
          What is the premise of the decision?
        </FieldLabel>
        <Input
          id={`${idPrefix}-premise`}
          {...register("decisionPremise", { required: true })}
        />
      </Field>
    </FieldGroup>
  );
};

export default DecisionFields;
