import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "#components/ui/field";
import { Textarea } from "#components/ui/textarea";
import { useFormContext } from "react-hook-form";
import type { TaskFormValues } from "../../task-form";

const ToolConfigField = () => {
  const {
    register,
    formState: { errors },
  } = useFormContext<TaskFormValues>();

  return (
    <Field>
      <FieldLabel htmlFor="task-tool-config">Tool config (JSON)</FieldLabel>
      <Textarea
        id="task-tool-config"
        placeholder='Optional JSON, for example {"id": 3, "done": true}.'
        {...register("toolConfigText")}
      />
      <FieldDescription>
        Optional JSON. The queued task state is also passed to the tool.
      </FieldDescription>
      <FieldError errors={[errors.toolConfigText]} />
    </Field>
  );
};

export default ToolConfigField;
