import { gql } from "../__generated__";

export const SYSTEM_ONE_PROMPT = gql(/* GraphQL */ `
  query systemOneChoiceQuery(
    $decisionPremise: String!
    $instruction: String!
    $type: DecisionType!
    $state: String!
    $options: [String!]
    $optionDescriptions: [String!]
  ) {
    systemOnePrompt(
      decisionPremise: $decisionPremise
      instruction: $instruction
      type: $type
      state: $state
      options: $options
      optionDescriptions: $optionDescriptions
    ) {
      answer
      model
    }
  }
`);
