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
  const { register, watch, reset } = useForm<Inputs>();

  useEffect(() => {
    if (values) {
      reset(values);
    }
  }, [values]);

  const debouncedSetValues = useCallback(
    debounce((variables: { instruction: string; decisionPremise: string }) => {
      setValues(variables);
    }, 500),
    [watch],
  );

  useEffect(() => {
    const { unsubscribe } = watch(({ instruction, decisionPremise }) => {
      const currentValues = {
        instruction: instruction ?? "",
        decisionPremise: decisionPremise ?? "",
      };

      debouncedSetValues(currentValues);
    });

    return () => unsubscribe();
  }, [watch, debouncedSetValues]);

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
