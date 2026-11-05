"use client";

import { Button } from "#components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#components/ui/field";
import {
  SubmitHandler,
  useForm,
  useFormContext,
  useWatch,
} from "react-hook-form";
import { Input } from "#components/ui/input";
import { Spinner } from "#components/ui/spinner";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#components/ui/card";
import ScoreResult from "../score/scoreResult";
import NoulResult from "../noul/noulResult";
import ChoiceResult from "../choice/choiceResult";
import { useLazyQuery } from "@apollo/client/react";
import { SYSTEM_ONE_PROMPT } from "@repo/queries/decisions/decision-queries";
import { useState } from "react";
import type { DecisionFormValues } from "../decision-form";
import { readSystemOneAnswer, type SystemOneAnswer } from "../decision-answer";

type Inputs = {
  state: string;
};

const StateCard = () => {
  const { control } = useFormContext<DecisionFormValues>();
  const values = useWatch({ control });
  const [prompt, { loading, error, data }] = useLazyQuery(SYSTEM_ONE_PROMPT);
  const [currentDecisionPremise, setCurrentDecisionPremise] =
    useState<string>("");

  const { register, handleSubmit } = useForm<Inputs>();

  const type = values.type ?? "noul";
  const options =
    type === "choice" || type === "score"
      ? (values.options ?? []).flatMap((option) =>
          option?.name ? [option.name] : [],
        )
      : undefined;
  const optionDescriptions =
    type === "choice"
      ? (values.options ?? []).flatMap((option) =>
          option?.description ? [option.description] : [],
        )
      : undefined;

  const onSubmit: SubmitHandler<Inputs> = (inputs) => {
    const variables = {
      decisionPremise: values.decisionPremise ?? "",
      instruction: values.instruction ?? "",
      options,
      optionDescriptions,
    };

    setCurrentDecisionPremise(variables.decisionPremise);
    void prompt({
      variables: { ...variables, state: inputs.state, type },
    });
  };

  const answer: SystemOneAnswer | undefined = readSystemOneAnswer(
    data?.systemOnePrompt?.answer,
    currentDecisionPremise,
  );

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Try the prompt</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="state">
                What is your current state?
              </FieldLabel>
              <Input id="state" {...register("state", { required: true })} />
            </Field>
            <Field>
              <FieldError errors={[error]} />
              <Button type="submit" disabled={loading}>
                {loading ? <Spinner /> : "Submit"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        {loading ? <Spinner /> : null}
        {!loading && answer ? (
          <div className="flex w-full flex-wrap gap-2">
            {answer.type === "noul" ? (
              <NoulResult
                decisionPremise={currentDecisionPremise}
                noul={answer.noul}
              />
            ) : null}
            {answer.type === "choice" ? (
              <ChoiceResult
                decisionPremise={currentDecisionPremise}
                confidence={answer.confidence}
                probabilities={answer.probabilities}
              />
            ) : null}
            {answer.type === "score" ? (
              <ScoreResult
                decisionPremise={currentDecisionPremise}
                confidence={answer.confidence}
                score={answer.score}
                legend={answer.legend}
                probabilities={answer.probabilities}
              />
            ) : null}
          </div>
        ) : null}
      </CardFooter>
    </Card>
  );
};

export default StateCard;
