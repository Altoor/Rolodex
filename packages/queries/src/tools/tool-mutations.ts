import { gql } from "../__generated__";

export const TEST_TOOL = gql(/* GraphQL */ `
  mutation TestTool(
    $key: String!
    $state: String!
    $toolConfig: JSON
    $model: String
    $decisionModel: String
    $toolState: JSON
    $outputType: String
  ) {
    testTool(
      key: $key
      state: $state
      toolConfig: $toolConfig
      model: $model
      decisionModel: $decisionModel
      toolState: $toolState
      outputType: $outputType
    ) {
      output
      summary
      state
      toolState
    }
  }
`);
