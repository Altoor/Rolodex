import { gql } from "../__generated__";

export const TASKS = gql(/* GraphQL */ `
  query GetTasks {
    tasks {
      id
      name
      type
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
