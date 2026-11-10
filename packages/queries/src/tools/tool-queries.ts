import { gql } from "../__generated__";

export const TOOLS = gql(/* GraphQL */ `
  query GetTools {
    tools {
      key
      name
      description
      category
      inputMode
      inputSchema
      outputDescription
      outputTypes
      foreachOutputDescription
      exampleConfig
    }
  }
`);

export const GET_TOOL = gql(/* GraphQL */ `
  query GetTool($key: String!) {
    getTool(key: $key) {
      key
      name
      description
      category
      inputMode
      inputSchema
      outputDescription
      outputTypes
      foreachOutputDescription
      exampleConfig
    }
  }
`);
