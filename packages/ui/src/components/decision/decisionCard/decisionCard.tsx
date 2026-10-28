"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from "#components/ui/card";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import NoulDecisionForm from "../noul/noulDecision";
import ChoiceDecisionForm from "../choice/choiceDecision";
import ScoreDecisionForm from "../score/scoreDecision";
import { Field, FieldGroup, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { useForm } from "react-hook-form";
import { useEffect } from "react";
import { Button } from "#components/ui/button";
import { Save } from "lucide-react";
import { DecisionType } from "@repo/queries/__generated__/graphql";

type Inputs = {
  name: string;
};

interface DecisionCardProps {
  values:
    | {
        decisionPremise: string;
        instruction: string;
        options?: Array<string>;
        optionDescriptions?: Array<string>;
        name: string;
      }
    | undefined;
  save: () => void;
  setValues: (variables: {
    decisionPremise: string;
    instruction: string;
    options?: Array<string>;
    optionDescriptions?: Array<string>;
    name: string;
  }) => void;
  setType: (type: DecisionType) => void;
  type: DecisionType;
}

const DecisionCard = ({
  values,
  setValues,
  setType,
  type,
  save,
}: DecisionCardProps) => {
  const { register, getValues, reset } = useForm<Inputs>();

  useEffect(() => {
    reset(values);
  }, [values, reset]);

  const typeOfChoice = [
    { label: "Noul", value: "noul" },
    { label: "Choice", value: "choice" },
    { label: "Score", value: "score" },
  ];

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row">
        <CardContent>
          <CardTitle>Decision</CardTitle>
          <CardDescription>Setup a decision</CardDescription>
          <Select
            items={typeOfChoice}
            defaultValue={"noul"}
            value={type}
            onValueChange={(value) => setType(value as DecisionType)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {typeOfChoice.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardContent>
        <CardContent className="w-full">
          <form>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input {...register("name", { required: true })} />
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
        <CardAction>
          <Button onClick={() => save()}>
            <Save></Save>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-32">
        {type === "noul" && (
          <NoulDecisionForm
            values={values}
            setValues={(formValues) => {
              setValues({
                ...formValues,
                name: getValues().name,
                options: undefined,
              });
            }}
          ></NoulDecisionForm>
        )}

        {type === "choice" && (
          <ChoiceDecisionForm
            values={values}
            setValues={(formValues) =>
              setValues({
                ...formValues,
                name: getValues().name,
                options: formValues.options.map((option) => option.name),
                optionDescriptions: formValues.options.map(
                  (option) => option.description,
                ),
              })
            }
          ></ChoiceDecisionForm>
        )}

        {type === "score" && (
          <ScoreDecisionForm
            values={values}
            setValues={(formValues) =>
              setValues({
                ...formValues,
                name: getValues().name,
                options: formValues.options.map((option) => option.name),
              })
            }
          ></ScoreDecisionForm>
        )}
      </CardContent>
    </Card>
  );
};

export default DecisionCard;
