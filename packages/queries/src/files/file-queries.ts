import { gql } from "../__generated__";

export const FILE_ENTRY_FIELDS = gql(/* GraphQL */ `
  fragment FileEntryFields on FileEntry {
    id
    parentId
    kind
    name
    description
    path
    fileType
    mimeType
    size
    contentHash
    lastEditedAt
    filesystemModifiedAt
    createdAt
    updatedAt
    deletedAt
  }
`);

export const GET_FILE_ENTRIES = gql(/* GraphQL */ `
  query GetFileEntries($parentId: Int, $includeDeleted: Boolean = false) {
    fileEntries(parentId: $parentId, includeDeleted: $includeDeleted) {
      ...FileEntryFields
    }
  }
`);

export const GET_FILE_ENTRY = gql(/* GraphQL */ `
  query GetFileEntry($id: Int!) {
    getFileEntry(id: $id) {
      ...FileEntryFields
    }
  }
`);

export const GET_FILE_TEXT = gql(/* GraphQL */ `
  query GetFileText($id: Int!, $maxBytes: Int) {
    getFileText(id: $id, maxBytes: $maxBytes)
  }
`);

export const CREATE_FILE_VIEW_TOKEN = gql(/* GraphQL */ `
  query CreateFileViewToken($id: Int!) {
    createFileViewToken(id: $id) {
      url
      expiresAt
    }
  }
`);
