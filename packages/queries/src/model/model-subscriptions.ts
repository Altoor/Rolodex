import { gql } from "../__generated__";

export const PULL_MODEL = gql(/* GraphQL */ `
  subscription PullModel($name: String!) {
    installModel(name: $name) {
      completed
      digest
      status
      total
    }
  }
`);
