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
      toolOutputType
      onTrueTaskId
      onFalseTaskId
      model
      decisionModel
      forceUserDecideIfNoMatch
      userDecisionType
      userDecisionConfig
      tool {
        key
        name
        description
        outputTypes
        foreachOutputDescription
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
        appendState
      }
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
      toolOutputType
      onTrueTaskId
      onFalseTaskId
      model
      decisionModel
      forceUserDecideIfNoMatch
      userDecisionType
      userDecisionConfig
      tool {
        key
        name
        description
        outputTypes
        foreachOutputDescription
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
        appendState
      }
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

export const ACTIVE_QUEUED_TASKS = gql(/* GraphQL */ `
  query ActiveQueuedTasks {
    activeQueuedTasks {
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
