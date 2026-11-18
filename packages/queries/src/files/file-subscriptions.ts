import { gql } from "../__generated__";

export const FILE_ENTRY_EVENT = gql(/* GraphQL */ `
  subscription FileEntryEvent {
    fileEntryEvent {
      type
      id
      parentId
      path
      at
    }
  }
`);
