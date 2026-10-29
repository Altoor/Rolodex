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
  SelectController,
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
import { useCallback, useEffect } from "react";
import { Button } from "#components/ui/button";
import { Save } from "lucide-react";
import { debounce } from "#lib/debounce";
import { DecisionType } from "@repo/queries/__generated__/graphql";

type Inputs = {
  name: string;
  type: DecisionType;
};

interface DecisionCardProps {
  values:
    | {
        decisionPremise: string;
        instruction: string;
        options?: Array<string>;
        optionDescriptions?: Array<string>;
        name: string;
        type: DecisionType;
      }
    | undefined;
  save: () => void;
  setValues: (variables: {
    decisionPremise: string;
    instruction: string;
    options?: Array<string>;
    optionDescriptions?: Array<string>;
    name: string;
    type: DecisionType;
  }) => void;
}

const DecisionCard = ({ values, setValues, save }: DecisionCardProps) => {
  const { register, getValues, reset, control, watch } = useForm<Inputs>({
    defaultValues: { name: "", type: "noul" as DecisionType },
  });

  useEffect(() => {
    reset({ name: values?.name ?? "", type: values?.type });
  }, [values, reset]);

  const typeOfChoice = [
    { label: "Noul", value: "noul" },
    { label: "Choice", value: "choice" },
    { label: "Score", value: "score" },
  ];

  const debouncedSetValues = useCallback(
    (variables: {
      decisionPremise: string;
      instruction: string;
      options?: Array<string>;
      optionDescriptions?: Array<string>;
      name: string;
      type: DecisionType;
    }) => {
      debounce(() => {
        setValues({ ...variables });
      }, 500)();
    },
    [getValues],
  );

  useEffect(() => {
    const { unsubscribe } = watch(({ name, type }) => {
      debouncedSetValues({
        name: name ?? "",
        type: type ?? ("noul" as DecisionType),
        decisionPremise: "",
        instruction: "",
        options: undefined,
        optionDescriptions: undefined,
      });
    });
    return () => unsubscribe();
  }, [watch, debouncedSetValues]);

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-row">
        <CardContent>
          <CardTitle>Decision</CardTitle>
          <CardDescription>Setup a decision</CardDescription>
          <SelectController name="type" control={control} defaultValue="noul">
            {(value, onChange) => (
              <>
                <Select value={value} onValueChange={onChange}>
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
              </>
            )}
          </SelectController>
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
        {getValues().type === "noul" && (
          <NoulDecisionForm
            values={values}
            setValues={(formValues) => {
              setValues({
                ...formValues,
                name: getValues().name,
                type: getValues().type,
                options: undefined,
              });
            }}
          ></NoulDecisionForm>
        )}

        {getValues().type === "choice" && (
          <ChoiceDecisionForm
            values={values}
            setValues={(formValues) =>
              setValues({
                ...formValues,
                name: getValues().name,
                type: getValues().type,
                options: formValues.options.map((option) => option.name),
                optionDescriptions: formValues.options.map(
                  (option) => option.description,
                ),
              })
            }
          ></ChoiceDecisionForm>
        )}

        {getValues().type === "score" && (
          <ScoreDecisionForm
            values={values}
            setValues={(formValues) =>
              setValues({
                ...formValues,
                name: getValues().name,
                type: getValues().type,
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
