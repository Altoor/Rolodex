import { gql } from "../__generated__";

export const QUEUED_TASK_EVENT = gql(/* GraphQL */ `
  subscription QueuedTaskEvent {
    queuedTaskEvent {
      message
      queuedTask {
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
  }
`);
