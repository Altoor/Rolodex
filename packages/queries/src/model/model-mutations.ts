import { gql } from "../__generated__";

export const UPDATE_MODEL_DESCRIPTION = gql(/* GraphQL */ `
  mutation UpdateModelDescription($name: String!, $description: String!) {
    updateModel(name: $name, description: $description) {
      size
      name
      description
      model
      capabilities
      pulled
    }
  }
`);

export const CREATE_MODEL_DESCRIPTION = gql(/* GraphQL */ `
  mutation CreateModelDescription($name: String!, $description: String) {
    createModel(name: $name, description: $description) {
      size
      name
      description
      model
      capabilities
      pulled
    }
  }
`);
