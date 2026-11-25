import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "#components/ui/field";
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
          {...register("decisionPremise", {
            required: true,
            validate: (value) => {
              const words = value.trim().split(/\s+/).filter(Boolean);
              return (
                (words.length > 0 && words.length <= 2) ||
                "Use one word, or at most two."
              );
            },
          })}
        />
        <FieldDescription>
          One word, or at most two. This is the answer key the model replies
          under, not a question.
        </FieldDescription>
      </Field>
    </FieldGroup>
  );
};

export default DecisionFields;
