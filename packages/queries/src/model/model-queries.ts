import { gql } from "../__generated__";

export const MODELS = gql(/* GraphQL */ `
  query GetModels {
    models {
      size
      name
      description
      model
      capabilities
      pulled
    }
  }
`);
