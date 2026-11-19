import { gql } from "../__generated__";

export const SUGGEST_USER_DECISION_OPTIONS = gql(/* GraphQL */ `
  mutation SuggestUserDecisionOptions(
    $taskId: Int!
    $state: String
    $prompt: String!
  ) {
    suggestUserDecisionOptions(
      taskId: $taskId
      state: $state
      prompt: $prompt
    ) {
      label
      description
      value
      resultTaskId
      resultTaskName
    }
  }
`);

export const CREATE_USER_DECISION_OPTIONS = gql(/* GraphQL */ `
  mutation CreateUserDecisionOptions($taskId: Int!, $options: JSON!) {
    createUserDecisionOptions(taskId: $taskId, options: $options) {
      id
      taskId
      kind
      label
      description
      value
      selector
      labelPath
      descriptionPath
      valuePath
      resultTaskId
      appendState
      sortOrder
    }
  }
`);

export const REFRESH_USER_DECISION_OPTIONS = gql(/* GraphQL */ `
  mutation RefreshUserDecisionOptions($queuedTaskId: Int!) {
    refreshUserDecisionOptions(queuedTaskId: $queuedTaskId) {
      id
      taskId
      state
      toolState
      parentQueuedTaskId
      depth
      status
      runId
      queued_by
      queued_at
      result
      pendingChoice
      model
      decisionModel
    }
  }
`);
