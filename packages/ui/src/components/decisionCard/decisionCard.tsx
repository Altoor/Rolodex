"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "#components/ui/card";
import { FieldDescription } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { useLazyQuery } from "@apollo/client/react";
import { SYSTEM_ONE_PROMPT } from "@repo/queries/decisions/decision-queries";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import NoulDecisionForm from "./noul/noulDecision";
import ChoiceDecisionForm from "./choice/choiceDecision";
import { useState } from "react";
import ScoreDecisionForm from "./score/scoreDecision";
import NoulResult from "./noul/noulResult";
import ChoiceResult from "./choice/choiceResult";
import ScoreResult from "./score/scoreResult";

const DecisionCard = () => {
  const [prompt, { loading, error, data }] = useLazyQuery(SYSTEM_ONE_PROMPT);
  const [type, setType] = useState<"noul" | "choice" | "score">("noul");
  const [currentDecisionPremise, setCurrentDecisionPremise] =
    useState<string>("");

  const typeOfChoice = [
    { label: "noul", value: "noul" },
    { label: "Choice", value: "choice" },
    { label: "Score", value: "score" },
  ];

  return (
    <Card className="min-w-2xl w-full">
      <CardHeader>
        <CardTitle>Decision</CardTitle>
        <CardDescription>Setup a decision</CardDescription>
      </CardHeader>
      <CardContent className="min-h-32">
        <Select
          items={typeOfChoice}
          defaultValue={"noul"}
          value={type}
          onValueChange={(value) => setType(value)}
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

        {type === "noul" && (
          <NoulDecisionForm
            promptSubmit={(variables) => {
              setCurrentDecisionPremise(variables.decisionPremise);
              prompt({ variables: { ...variables, type: "noul" } });
            }}
            loading={loading}
            error={error}
          ></NoulDecisionForm>
        )}

        {type === "choice" && (
          <ChoiceDecisionForm
            promptSubmit={(variables) => {
              setCurrentDecisionPremise(variables.decisionPremise);
              prompt({
                variables: {
                  ...variables,
                  type: "choice",
                  options: variables.options.map((item) => item.name),
                  optionDescriptions: variables.options.map(
                    (item) => item.description,
                  ),
                },
              });
            }}
            loading={loading}
            error={error}
          ></ChoiceDecisionForm>
        )}

        {type === "score" && (
          <ScoreDecisionForm
            promptSubmit={(variables) => {
              setCurrentDecisionPremise(variables.decisionPremise);
              prompt({
                variables: {
                  ...variables,
                  type: "score",
                  options: variables.options.map((item) => item.name),
                },
              });
            }}
            loading={loading}
            error={error}
          ></ScoreDecisionForm>
        )}
      </CardContent>
      <CardFooter>
        {loading ? (
          <Spinner />
        ) : (
          data && (
            <>
              {type === "noul" && (
                <NoulResult
                  decisionPremise={currentDecisionPremise}
                  noul={
                    (data.systemOnePrompt?.answer as any)[
                      currentDecisionPremise
                    ].noul
                  }
                ></NoulResult>
              )}

              {type === "choice" && (
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
              {type === "score" && (
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

export default DecisionCard;
