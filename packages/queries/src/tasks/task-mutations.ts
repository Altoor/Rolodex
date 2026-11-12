import { gql } from "../__generated__";

export const CREATE_TASK = gql(/* GraphQL */ `
  mutation CreateTask(
    $name: String!
    $type: TaskType!
    $decisionId: Int
    $fallbackTaskId: Int
    $toolKey: String
    $toolConfig: JSON
    $toolOutputType: ToolOutputType
    $onTrueTaskId: Int
    $onFalseTaskId: Int
    $model: String
    $decisionModel: String
    $forceUserDecideIfNoMatch: Boolean
    $userDecisionType: UserDecisionType
    $userDecisionConfig: JSON
  ) {
    createTask(
      name: $name
      type: $type
      decisionId: $decisionId
      fallbackTaskId: $fallbackTaskId
      toolKey: $toolKey
      toolConfig: $toolConfig
      toolOutputType: $toolOutputType
      onTrueTaskId: $onTrueTaskId
      onFalseTaskId: $onFalseTaskId
      model: $model
      decisionModel: $decisionModel
      forceUserDecideIfNoMatch: $forceUserDecideIfNoMatch
      userDecisionType: $userDecisionType
      userDecisionConfig: $userDecisionConfig
    ) {
      id
      name
      type
      toolKey
      toolConfig
      toolOutputType
      onTrueTaskId
      onFalseTaskId
      model
      decisionModel
      forceUserDecideIfNoMatch
      userDecisionType
      userDecisionConfig
      userDecisionOptions {
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
      tool {
        key
        name
        description
        outputTypes
        foreachOutputDescription
      }
      decision {
        id
        options
        type
      }
    }
  }
`);

export const UPDATE_TASK = gql(/* GraphQL */ `
  mutation UpdateTask(
    $id: Int!
    $name: String
    $type: TaskType
    $decisionId: Int
    $fallbackTaskId: Int
    $toolKey: String
    $toolConfig: JSON
    $toolOutputType: ToolOutputType
    $onTrueTaskId: Int
    $onFalseTaskId: Int
    $model: String
    $decisionModel: String
    $forceUserDecideIfNoMatch: Boolean
    $userDecisionType: UserDecisionType
    $userDecisionConfig: JSON
  ) {
    updateTask(
      id: $id
      name: $name
      type: $type
      decisionId: $decisionId
      fallbackTaskId: $fallbackTaskId
      toolKey: $toolKey
      toolConfig: $toolConfig
      toolOutputType: $toolOutputType
      onTrueTaskId: $onTrueTaskId
      onFalseTaskId: $onFalseTaskId
      model: $model
      decisionModel: $decisionModel
      forceUserDecideIfNoMatch: $forceUserDecideIfNoMatch
      userDecisionType: $userDecisionType
      userDecisionConfig: $userDecisionConfig
    ) {
      id
      name
      type
      toolKey
      toolConfig
      toolOutputType
      onTrueTaskId
      onFalseTaskId
      model
      decisionModel
      forceUserDecideIfNoMatch
      userDecisionType
      userDecisionConfig
      userDecisionOptions {
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
      tool {
        key
        name
        description
        outputTypes
        foreachOutputDescription
      }
      decision {
        id
        options
        type
      }
    }
  }
`);

export const DELETE_TASK = gql(/* GraphQL */ `
  mutation DeleteTask($id: Int!) {
    deleteTask(id: $id)
  }
`);

export const CREATE_TASKRESULT = gql(/* GraphQL */ `
  mutation CreateTaskResult(
    $type: DecisionType!
    $taskId: Int!
    $confidenceThreshold: Float
    $probabilityThreshold: Float
    $scoreThreshold: Float
    $resultTaskId: Int
    $option: String
  ) {
    createTaskResult(
      type: $type
      taskId: $taskId
      confidenceThreshold: $confidenceThreshold
      probabilityThreshold: $probabilityThreshold
      scoreThreshold: $scoreThreshold
      resultTaskId: $resultTaskId
      option: $option
    ) {
      confidenceThreshold
      id
      option
      probabilityThreshold
      resultTaskId
      scoreThreshold
      taskId
      type
      appendState
    }
  }
`);

export const UPDATE_TASKRESULT = gql(/* GraphQL */ `
  mutation UpdateTaskResult(
    $id: Int!
    $type: DecisionType
    $taskId: Int
    $confidenceThreshold: Float
    $probabilityThreshold: Float
    $scoreThreshold: Float
    $resultTaskId: Int
    $option: String
  ) {
    updateTaskResult(
      id: $id
      type: $type
      taskId: $taskId
      confidenceThreshold: $confidenceThreshold
      probabilityThreshold: $probabilityThreshold
      scoreThreshold: $scoreThreshold
      resultTaskId: $resultTaskId
      option: $option
    ) {
      confidenceThreshold
      id
      option
      probabilityThreshold
      resultTaskId
      scoreThreshold
      taskId
      type
      appendState
    }
  }
`);

export const DELETE_TASKRESULT = gql(/* GraphQL */ `
  mutation DeleteTaskResult($id: Int!) {
    deleteTaskResult(id: $id)
  }
`);

export const CREATE_USER_DECISION_OPTION = gql(/* GraphQL */ `
  mutation CreateUserDecisionOption(
    $taskId: Int!
    $kind: UserDecisionOptionKind!
    $label: String
    $description: String
    $value: String
    $selector: JSON
    $labelPath: String
    $descriptionPath: String
    $valuePath: String
    $resultTaskId: Int
    $appendState: Boolean
    $sortOrder: Int
  ) {
    createUserDecisionOption(
      taskId: $taskId
      kind: $kind
      label: $label
      description: $description
      value: $value
      selector: $selector
      labelPath: $labelPath
      descriptionPath: $descriptionPath
      valuePath: $valuePath
      resultTaskId: $resultTaskId
      appendState: $appendState
      sortOrder: $sortOrder
    ) {
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

export const UPDATE_USER_DECISION_OPTION = gql(/* GraphQL */ `
  mutation UpdateUserDecisionOption(
    $id: Int!
    $kind: UserDecisionOptionKind
    $label: String
    $description: String
    $value: String
    $selector: JSON
    $labelPath: String
    $descriptionPath: String
    $valuePath: String
    $resultTaskId: Int
    $appendState: Boolean
    $sortOrder: Int
  ) {
    updateUserDecisionOption(
      id: $id
      kind: $kind
      label: $label
      description: $description
      value: $value
      selector: $selector
      labelPath: $labelPath
      descriptionPath: $descriptionPath
      valuePath: $valuePath
      resultTaskId: $resultTaskId
      appendState: $appendState
      sortOrder: $sortOrder
    ) {
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

export const DELETE_USER_DECISION_OPTION = gql(/* GraphQL */ `
  mutation DeleteUserDecisionOption($id: Int!) {
    deleteUserDecisionOption(id: $id)
  }
`);

export const ANSWER_USER_DECISION = gql(/* GraphQL */ `
  mutation AnswerUserDecision($queuedTaskId: Int!, $optionId: String!) {
    answerUserDecision(queuedTaskId: $queuedTaskId, optionId: $optionId) {
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
      task {
        id
        name
        type
        toolKey
      }
    }
  }
`);

export const DISMISS_QUEUED_TASK = gql(/* GraphQL */ `
  mutation DismissQueuedTask($id: Int!) {
    dismissQueuedTask(id: $id) {
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
      task {
        id
        name
        type
        toolKey
      }
    }
  }
`);

export const CREATE_QUEUED_TASK = gql(/* GraphQL */ `
  mutation CreateQueuedTask($taskId: Int, $state: String!) {
    createQueuedTask(taskId: $taskId, state: $state) {
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
      task {
        id
        name
        type
        toolKey
      }
    }
  }
`);
