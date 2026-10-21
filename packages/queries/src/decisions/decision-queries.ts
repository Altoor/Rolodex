import { gql } from "../__generated__";

export const SYSTEM_ONE_SCORE_PROMPT = gql(/* GraphQL */ `
  query systemOneScoreQuery(
    $decisionType: String!
    $instruction: String!
    $options: [String!]!
    $state: String!
  ) {
    systemOneScorePrompt(
      decisionType: $decisionType
      instruction: $instruction
      options: $options
      state: $state
    ) {
      answer
      model
    }
  }
`);

export const SYSTEM_ONE_NOUL_PROMPT = gql(/* GraphQL */ `
  query systemOneNoulQuery(
    $decisionType: String!
    $instruction: String!
    $state: String!
  ) {
    systemOneNoulPrompt(
      decisionType: $decisionType
      instruction: $instruction
      state: $state
    ) {
      answer
      model
    }
  }
`);

export const SYSTEM_ONE_CHOICE_PROMPT = gql(/* GraphQL */ `
  query systemOneChoiceQuery(
    $decisionType: String!
    $instruction: String!
    $options: [String!]!
    $optionDescriptions: [String!]!
    $state: String!
  ) {
    systemOneChoicePrompt(
      decisionType: $decisionType
      instruction: $instruction
      options: $options
      optionDescriptions: $optionDescriptions
      state: $state
    ) {
      answer
      model
    }
  }
`);
