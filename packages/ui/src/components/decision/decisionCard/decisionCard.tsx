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
import { Button } from "#components/ui/button";
import { Spinner } from "#components/ui/spinner";
import { Save } from "lucide-react";
import { useFormContext, useWatch } from "react-hook-form";
import type { DecisionFormValues } from "../decision-form";

interface DecisionCardProps {
  save: () => void;
  saving?: boolean;
}

const DECISION_TYPES = [
  { label: "Noul", value: "noul" },
  { label: "Choice", value: "choice" },
  { label: "Score", value: "score" },
] as const;

const DecisionCard = ({ save, saving = false }: DecisionCardProps) => {
  const { register, control } = useFormContext<DecisionFormValues>();
  const type = useWatch({ control, name: "type" });

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="w-full">
          <CardTitle>Decision</CardTitle>
          <CardDescription>Set up a decision.</CardDescription>
          <SelectController name="type" control={control} defaultValue="noul">
            {(value, onChange) => (
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="w-(--size-select-sm)">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {DECISION_TYPES.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            )}
          </SelectController>
        </div>
        <div className="w-full">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="decision-name">Name</FieldLabel>
              <Input
                id="decision-name"
                {...register("name", { required: true })}
              />
            </Field>
          </FieldGroup>
        </div>
        <CardAction>
          <Button
            type="button"
            onClick={save}
            disabled={saving}
            title="Save decision"
            aria-label="Save decision"
          >
            {saving ? <Spinner /> : <Save />}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-32">
        {type === "noul" ? <NoulDecisionForm /> : null}
        {type === "choice" ? <ChoiceDecisionForm /> : null}
        {type === "score" ? <ScoreDecisionForm /> : null}
      </CardContent>
    </Card>
  );
};

export default DecisionCard;
