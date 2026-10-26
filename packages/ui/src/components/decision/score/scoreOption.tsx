"use client";

import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Item } from "#components/ui/item";
import { useForm } from "react-hook-form";

type Inputs = {
  name: string;
};

interface ScoreOptionProps {
  defaultValues: { name: string };
  setValues: (option: { name: string }) => void;
}

const ScoreOption = ({ defaultValues, setValues }: ScoreOptionProps) => {
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
      </FieldGroup>
    </Item>
  );
};

export default ScoreOption;
