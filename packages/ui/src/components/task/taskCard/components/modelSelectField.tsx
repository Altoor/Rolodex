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
import {
  USE_USER_DEFAULT_MODEL,
  type TaskFormValues,
} from "../../task-form";

type ModelFieldName = "model" | "decisionModel";

interface ModelSelectFieldProps {
  name: ModelFieldName;
  label: string;
  description: string;
  models: string[];
}

const ModelSelectField = ({
  name,
  label,
  description,
  models,
}: ModelSelectFieldProps) => {
  const { control } = useFormContext<TaskFormValues>();

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <SelectController name={name} control={control}>
        {(value, onChange) => (
          <Select
            value={value ?? USE_USER_DEFAULT_MODEL}
            onValueChange={onChange}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={USE_USER_DEFAULT_MODEL}>
                  Use user default
                </SelectItem>
                {models.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
      </SelectController>
      <FieldDescription>{description}</FieldDescription>
    </Field>
  );
};

export default ModelSelectField;
