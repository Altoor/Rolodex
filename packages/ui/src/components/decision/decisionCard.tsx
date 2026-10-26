"use client";

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "#components/ui/card";
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
import ScoreDecisionForm from "./score/scoreDecision";

interface DecisionCardProps {
  setValues: (variables: {
    decisionPremise: string;
    instruction: string;
    options?: Array<string> | string | null | undefined;
    optionDescriptions?: Array<string> | string | null | undefined;
  }) => void;

  setType: (type: "noul" | "choice" | "score") => void;
  type: "noul" | "choice" | "score";
}

const DecisionCard = ({ setValues, setType, type }: DecisionCardProps) => {
  const typeOfChoice = [
    { label: "Noul", value: "noul" },
    { label: "Choice", value: "choice" },
    { label: "Score", value: "score" },
  ];

  return (
    <Card className="min-w-1/3">
      <CardHeader>
        <CardTitle>Decision</CardTitle>
        <CardDescription>Setup a decision</CardDescription>
      </CardHeader>
      <CardContent className="min-h-32">
        <Select
          items={typeOfChoice}
          defaultValue={"noul"}
          value={type}
          onValueChange={(value) =>
            setType(value as "noul" | "choice" | "score")
          }
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
            setValues={(values) =>
              setValues({
                ...values,
                options: null,
              })
            }
          ></NoulDecisionForm>
        )}

        {type === "choice" && (
          <ChoiceDecisionForm
            setValues={(values) =>
              setValues({
                ...values,
                options: values.options.map((option) => option.name),
                optionDescriptions: values.options.map(
                  (option) => option.description,
                ),
              })
            }
          ></ChoiceDecisionForm>
        )}

        {type === "score" && (
          <ScoreDecisionForm
            setValues={(values) =>
              setValues({
                ...values,
                options: values.options.map((option) => option.name),
              })
            }
          ></ScoreDecisionForm>
        )}
      </CardContent>
    </Card>
  );
};

export default DecisionCard;
