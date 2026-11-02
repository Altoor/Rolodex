"use client";

import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Item } from "#components/ui/item";
import { useDebouncedFormState } from "#hooks/useDebouncedFormState";
import { X } from "lucide-react";

type Inputs = {
  name: string;
};

interface ScoreOptionProps {
  values: { name: string };
  setValues: (option: { name: string }) => void;
  onDelete: () => void;
}

const ScoreOption = ({ values, setValues, onDelete }: ScoreOptionProps) => {
  const { register } = useDebouncedFormState<Inputs>({
    fieldsToWatch: ["name"],
    valuesFromFields: (watched) => ({
      name: (watched["name"] as string) ?? "",
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
      </FieldGroup>
    </Item>
  );
};

export default ScoreOption;
