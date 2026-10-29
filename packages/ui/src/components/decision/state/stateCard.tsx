"use client";

import { Button } from "#components/ui/button";

import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#components/ui/field";
import { SubmitHandler, useForm } from "react-hook-form";
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
import { DecisionType } from "@repo/queries/__generated__/graphql";

type Inputs = {
  state: string;
};

interface StateCardProps {
  variables?: {
    decisionPremise: string;
    instruction: string;
    options?: Array<string> | string | null | undefined;
    optionDescriptions?: Array<string> | string | null | undefined;
  };
  type: DecisionType;
}

const StateCard = ({ variables, type }: StateCardProps) => {
  const [prompt, { loading, error, data }] = useLazyQuery(SYSTEM_ONE_PROMPT);
  const [currentDecisionPremise, setCurrentDecisionPremise] =
    useState<string>("");

  const { register, handleSubmit } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    if (variables) {
      setCurrentDecisionPremise(variables?.decisionPremise);
      prompt({ variables: { ...variables, state: inputs.state, type: type } });
    }
  };

  return (
    <Card className="min-w-1/3">
      <CardHeader>
        <CardTitle>Try the prompt</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="state">
                What is your current state
              </FieldLabel>
              <Input {...register("state", { required: true })} />
            </Field>
            <Field>
              <FieldError errors={[error]}></FieldError>
              <Button type="submit">{loading ? <Spinner /> : "Submit"}</Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        {loading ? (
          <Spinner />
        ) : (
          data && (
            <>
              {(data.systemOnePrompt?.answer as any)[currentDecisionPremise][
                "noul"
              ] !== undefined && (
                <NoulResult
                  decisionPremise={currentDecisionPremise}
                  noul={
                    (data.systemOnePrompt?.answer as any)[
                      currentDecisionPremise
                    ].noul
                  }
                ></NoulResult>
              )}

              {(data.systemOnePrompt?.answer as any)[currentDecisionPremise][
                "choice"
              ] !== undefined && (
                <ChoiceResult
                  decisionPremise={currentDecisionPremise}
                  confidence={
                    (data.systemOnePrompt?.answer as any)[
                      currentDecisionPremise
                    ].confidence
                  }
                  probabilities={
                    (data.systemOnePrompt?.answer as any)[
                      currentDecisionPremise
                    ].probabilities
                  }
                ></ChoiceResult>
              )}
              {(data.systemOnePrompt?.answer as any)[currentDecisionPremise][
                "score"
              ] !== undefined && (
                <ScoreResult
                  decisionPremise={currentDecisionPremise}
                  confidence={
                    (data.systemOnePrompt?.answer as any)[
                      currentDecisionPremise
                    ].confidence
                  }
                  score={
                    (data.systemOnePrompt?.answer as any)[
                      currentDecisionPremise
                    ].score
                  }
                  legend={
                    (data.systemOnePrompt?.answer as any)[
                      currentDecisionPremise
                    ].legend
                  }
                  probabilities={
                    (data.systemOnePrompt?.answer as any)[
                      currentDecisionPremise
                    ].probabilities
                  }
                ></ScoreResult>
              )}
            </>
          )
        )}
      </CardFooter>
    </Card>
  );
};

export default StateCard;
