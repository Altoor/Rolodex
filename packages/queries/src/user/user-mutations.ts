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

export const UPDATE_USER_SETTINGS = gql(/* GraphQL */ `
  mutation UpdateUserSettings(
    $defaultTaskId: Int
    $autoImprovement: Boolean
    $defaultModelName: String
    $defaultDecisionModelName: String
    $defaultVisionModelName: String
  ) {
    updateUserSettings(
      defaultTaskId: $defaultTaskId
      autoImprovement: $autoImprovement
      defaultModelName: $defaultModelName
      defaultDecisionModelName: $defaultDecisionModelName
      defaultVisionModelName: $defaultVisionModelName
    ) {
      userId
      defaultTaskId
      autoImprovement
      defaultModelName
      defaultDecisionModelName
      defaultVisionModelName
    }
  }
`);
