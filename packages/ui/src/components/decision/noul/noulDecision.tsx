import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { useFormContext } from "react-hook-form";
import type { DecisionFormValues } from "../decision-form";

const NoulDecisionForm = () => {
  const { register } = useFormContext<DecisionFormValues>();

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor="noul-instruction">
          What is your current instruction?
        </FieldLabel>
        <Input
          id="noul-instruction"
          {...register("instruction", { required: true })}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="noul-premise">
          What is the premise of the decision?
        </FieldLabel>
        <Input
          id="noul-premise"
          {...register("decisionPremise", { required: true })}
        />
      </Field>
    </FieldGroup>
  );
};

export default NoulDecisionForm;
