import { gql } from "../__generated__";

export const TEST_TOOL = gql(/* GraphQL */ `
  mutation TestTool(
    $key: String!
    $state: String!
    $toolConfig: JSON
    $model: String
    $decisionModel: String
  ) {
    testTool(
      key: $key
      state: $state
      toolConfig: $toolConfig
      model: $model
      decisionModel: $decisionModel
    ) {
      output
      summary
    }
  }
`);
