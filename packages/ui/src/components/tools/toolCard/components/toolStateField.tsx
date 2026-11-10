import { Field, FieldError, FieldLabel } from "#components/ui/field";
import { Textarea } from "#components/ui/textarea";
import { useFormContext } from "react-hook-form";
import type { ToolTestInputs, ToolView } from "../tool-test-service";

interface ToolStateFieldProps {
  tool: ToolView;
}

const ToolStateField = ({ tool }: ToolStateFieldProps) => {
  const {
    register,
    formState: { errors },
  } = useFormContext<ToolTestInputs>();

  return (
    <Field>
      <FieldLabel htmlFor={`tool-${tool.key}-state`}>State</FieldLabel>
      <Textarea
        id={`tool-${tool.key}-state`}
        placeholder="The input passed to the tool."
        {...register("state", { required: "state is required" })}
      />
      <FieldError errors={[errors.state]} />
    </Field>
  );
};

export default ToolStateField;
