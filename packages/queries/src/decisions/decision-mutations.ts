import { gql } from "../__generated__";

export const CREATE_SYSTEM_ONE_PROMPT = gql(/* GraphQL */ `
  mutation createSystemOneChoiceDescision(
    $decisionPremise: String!
    $instruction: String!
    $type: DecisionType!
    $name: String!
    $options: [String!]
    $optionDescriptions: [String!]
  ) {
    createDecision(
      decisionPremise: $decisionPremise
      instruction: $instruction
      type: $type
      name: $name
      options: $options
      optionDescriptions: $optionDescriptions
    ) {
      id
      decisionPremise
      instruction
      name
      optionDescriptions
      options
      type
    }
  }
`);

export const UPDATE_SYSTEM_ONE_PROMPT = gql(/* GraphQL */ `
  mutation updateSystemOneChoiceDescision(
    $id: Int!
    $decisionPremise: String
    $instruction: String
    $type: DecisionType
    $name: String
    $options: [String!]
    $optionDescriptions: [String!]
  ) {
    updateDecision(
      id: $id
      decisionPremise: $decisionPremise
      instruction: $instruction
      type: $type
      name: $name
      options: $options
      optionDescriptions: $optionDescriptions
    ) {
      id
      decisionPremise
      instruction
      name
      optionDescriptions
      options
      type
    }
  }
`);

export const DELETE_SYSTEM_ONE_PROMPT = gql(/* GraphQL */ `
  mutation deleteSystemOneChoiceDescision($id: Int!) {
    deleteDecision(id: $id)
  }
`);
