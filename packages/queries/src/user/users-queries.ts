import { gql } from "../__generated__";

export const ME = gql(/* GraphQL */ `
  query GetMe {
    me {
      email
      id
      name
    }
  }
`);
