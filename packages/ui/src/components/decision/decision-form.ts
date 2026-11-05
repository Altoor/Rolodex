import type { DecisionType } from "@repo/queries/__generated__/graphql";

export type DecisionOptionFormValues = {
  name: string;
  description: string;
};

export type DecisionFormValues = {
  name: string;
  type: DecisionType;
  instruction: string;
  decisionPremise: string;
  options: DecisionOptionFormValues[];
};

export const emptyDecisionFormValues: DecisionFormValues = {
  name: "",
  type: "noul",
  instruction: "",
  decisionPremise: "",
  options: [],
};

type DecisionRecord = {
  name: string | null;
  type: string | null;
  instruction: string | null;
  decisionPremise: string | null;
  options: string[] | null;
  optionDescriptions: string[] | null;
};

export const decisionToFormValues = (
  decision: DecisionRecord,
): DecisionFormValues => {
  const options = decision.options ?? [];
  const descriptions = decision.optionDescriptions ?? [];

  return {
    name: decision.name ?? "",
    type: (decision.type as DecisionType | null) ?? "noul",
    instruction: decision.instruction ?? "",
    decisionPremise: decision.decisionPremise ?? "",
    options: options.map((name, index) => ({
      name,
      description: descriptions[index] ?? "",
    })),
  };
};

export const decisionFormValuesToVariables = (values: DecisionFormValues) => ({
  name: values.name,
  type: values.type,
  instruction: values.instruction,
  decisionPremise: values.decisionPremise,
  options:
    values.type === "choice" || values.type === "score"
      ? values.options.map((option) => option.name)
      : undefined,
  optionDescriptions:
    values.type === "choice"
      ? values.options.map((option) => option.description)
      : undefined,
});
