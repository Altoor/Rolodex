"use client";

import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Item } from "#components/ui/item";
import { Textarea } from "#components/ui/textarea";
import { useForm } from "react-hook-form";

type Inputs = {
  name: string;
  description: string;
};

interface ChoiceOptionProps {
  defaultValues: { name: string; description: string };
  setValues: (option: { name: string; description: string }) => void;
}

const ChoiceOption = ({ defaultValues, setValues }: ChoiceOptionProps) => {
  const { register, getValues } = useForm<Inputs>();

  return (
    <Item variant={"outline"} className="max-w-60">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            {...register("name", { required: true })}
            onChange={() => setValues(getValues())}
            defaultValue={defaultValues.name}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="description">Description</FieldLabel>
          <Textarea
            {...register("description", { required: true })}
            onChange={() => setValues(getValues())}
            defaultValue={defaultValues.description}
          />
        </Field>
      </FieldGroup>
    </Item>
  );
};

export default ChoiceOption;
