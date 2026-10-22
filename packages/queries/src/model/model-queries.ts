import { gql } from "../__generated__";

export const MODELS = gql(/* GraphQL */ `
  query GetModels {
    models {
      size_vram
      size
      name
      model
      details {
        families
        family
        parameter_size
      }
    }
  }
`);
