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
