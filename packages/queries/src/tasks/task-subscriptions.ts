import { gql } from "../__generated__";

export const QUEUED_TASK_EVENT = gql(/* GraphQL */ `
  subscription QueuedTaskEvent {
    queuedTaskEvent {
      message
      queuedTask {
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
  }
`);
