import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import {
  Select,
  SelectContent,
  SelectController,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { useFormContext } from "react-hook-form";
import type { TaskFormValues } from "../../task-form";

interface ToolOutputTypeFieldProps {
  supportedOutputTypes: string[];
}

const ToolOutputTypeField = ({
  supportedOutputTypes,
}: ToolOutputTypeFieldProps) => {
  const { control } = useFormContext<TaskFormValues>();

  if (supportedOutputTypes.length <= 1) return null;

  return (
    <Field>
      <FieldLabel>Output type</FieldLabel>
      <SelectController
        name="toolOutputType"
        control={control}
        defaultValue="normal"
      >
        {(value, onChange) => (
          <Select value={value ?? "normal"} onValueChange={onChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {supportedOutputTypes.map((outputType) => (
                  <SelectItem key={outputType} value={outputType}>
                    {outputType}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </SelectController>
      <FieldDescription>
        Foreach runs the next task once per returned item.
      </FieldDescription>
    </Field>
  );
};

export default ToolOutputTypeField;
