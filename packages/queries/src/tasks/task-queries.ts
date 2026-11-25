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
      joinTaskId
      model
      decisionModel
      decisionStateConfig
      forceUserDecideIfNoMatch
      userDecisionType
      userDecisionConfig
      canRunInParallel
      prioritize
      tool {
        key
        name
        description
        usesModel
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
      joinTaskId
      model
      decisionModel
      decisionStateConfig
      forceUserDecideIfNoMatch
      userDecisionType
      userDecisionConfig
      canRunInParallel
      prioritize
      tool {
        key
        name
        description
        usesModel
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
      forkGroupId
      forkIndex
      isJoin
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
        toolConfig
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
      forkGroupId
      forkIndex
      isJoin
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
        toolConfig
      }
    }
  }
`);

export const STANDARD_RUN_HISTORY = gql(/* GraphQL */ `
  query StandardRunHistory($limit: Int, $offset: Int) {
    standardRunHistory(limit: $limit, offset: $offset) {
      id
      status
      state
      startTaskId
      createdAt
      updatedAt
      steps {
        id
        taskId
        state
        toolState
        parentQueuedTaskId
        forkGroupId
        forkIndex
        isJoin
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
          toolConfig
        }
      }
    }
  }
`);
