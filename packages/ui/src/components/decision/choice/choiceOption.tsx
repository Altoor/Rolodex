"use client";

import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Item } from "#components/ui/item";
import { Textarea } from "#components/ui/textarea";
import { useDebouncedFormState } from "#hooks/useDebouncedFormState";
import { X } from "lucide-react";

type Inputs = {
  name: string;
  description: string;
};

interface ChoiceOptionProps {
  values: { name: string; description: string };
  setValues: (option: { name: string; description: string }) => void;
  onDelete: () => void;
}

const ChoiceOption = ({ values, setValues, onDelete }: ChoiceOptionProps) => {
  const { register } = useDebouncedFormState<Inputs>({
    fieldsToWatch: ["name", "description"],
    valuesFromFields: (watched) => ({
      name: (watched["name"] as string) ?? "",
      description: (watched["description"] as string) ?? "",
    }),
    delay: 0,
    values,
    setValues,
  });

  return (
    <Item variant={"outline"} className="relative max-w-60">
      <button
        className="absolute right-2 top-2 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
      >
        <X className="size-4" />
      </button>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input {...register("name", { required: true })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea {...register("description", { required: true })} />
        </Field>
      </FieldGroup>
    </Item>
  );
};

export default ChoiceOption;
