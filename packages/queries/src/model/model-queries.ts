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

export const INSTALLED_MODELS = gql(/* GraphQL */ `
  query GetInstalledModels {
    installedModels {
      name
      description
      pulled
    }
  }
`);
