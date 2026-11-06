import { gql } from "../__generated__";

export const TASKS = gql(/* GraphQL */ `
  query GetTasks {
    tasks {
      id
      name
      type
      fallbackTaskId
      toolKey
      toolConfig
      model
      decisionModel
      tool {
        key
        name
        description
      }
      taskResults {
        confidenceThreshold
        id
        option
        probabilityThreshold
        resultTaskId
        scoreThreshold
        type
        taskId
      }
      decision {
        id
        options
        type
      }
    }
  }
`);

export const GET_TASK = gql(/* GraphQL */ `
  query GetTask($id: Int!) {
    getTask(id: $id) {
      id
      name
      type
      fallbackTaskId
      toolKey
      toolConfig
      model
      decisionModel
      tool {
        key
        name
        description
      }
      taskResults {
        type
        taskId
        scoreThreshold
        resultTaskId
        confidenceThreshold
        id
        option
        probabilityThreshold
      }
      decision {
        id
        options
        type
      }
    }
  }
`);

export const QUEUED_TASK = gql(/* GraphQL */ `
  query QueuedTask($runId: String) {
    queuedTask(runId: $runId) {
      id
      taskId
      state
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

export const ACTIVE_QUEUED_TASKS = gql(/* GraphQL */ `
  query ActiveQueuedTasks {
    activeQueuedTasks {
      id
      taskId
      state
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
