import { Field, FieldError, FieldLabel } from "#components/ui/field";
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
import type { ToolDetailsData } from "#components/tools/toolDetails";
import { NO_BRANCH_TASK, type TaskFormValues } from "../../task-form";

interface ToolSelectFieldProps {
  tools: ToolDetailsData[];
}

const ToolSelectField = ({ tools }: ToolSelectFieldProps) => {
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<TaskFormValues>();

  return (
    <Field>
      <FieldLabel>Tool</FieldLabel>
      <SelectController
        name="toolKey"
        control={control}
        rules={{ required: "select a tool" }}
      >
        {(value, onChange) => (
          <Select
            value={value}
            onValueChange={(next) => {
              onChange(next);
              // Branch/output settings are tool-specific; reset them when
              // switching tools to avoid stale validation errors.
              setValue("toolOutputType", "normal");
              setValue("onTrueTaskId", NO_BRANCH_TASK);
              setValue("onFalseTaskId", NO_BRANCH_TASK);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a tool" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {tools.map((tool) => (
                  <SelectItem key={tool.key ?? tool.name} value={tool.key ?? ""}>
                    {tool.name ?? tool.key}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </SelectController>
      <FieldError errors={[errors.toolKey]} />
    </Field>
  );
};

export default ToolSelectField;
