import { gql } from "../__generated__";

export const LOGIN = gql(/* GraphQL */ `
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password)
  }
`);

export const CREATEUSER = gql(/* GraphQL */ `
  mutation MyMutation($email: String!, $name: String!, $password: String!) {
    createUser(email: $email, name: $name, password: $password)
  }
`);
