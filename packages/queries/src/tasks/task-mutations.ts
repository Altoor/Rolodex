import { gql } from "../__generated__";

export const CREATE_TASK = gql(/* GraphQL */ `
  mutation CreateTask($name: String!, $type: TaskType!, $decisionId: Int) {
    createTask(name: $name, type: $type, decisionId: $decisionId) {
      id
      name
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
  ) {
    updateTask(id: $id, name: $name, type: $type, decisionId: $decisionId) {
      id
      name
      type
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
    $confidenceThreshold: Float!
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
    }
  }
`);

export const DELETE_TASKRESULT = gql(/* GraphQL */ `
  mutation DeleteTaskResult($id: Int!) {
    deleteTaskResult(id: $id)
  }
`);
