import { gql } from "../__generated__";

export const EXPORT_TASKS = gql(/* GraphQL */ `
  query ExportTasks($taskIds: [Int!]) {
    exportTasks(taskIds: $taskIds)
  }
`);

export const IMPORT_TASKS = gql(/* GraphQL */ `
  mutation ImportTasks($data: JSON!, $reuseExisting: Boolean) {
    importTasks(data: $data, reuseExisting: $reuseExisting)
  }
`);
