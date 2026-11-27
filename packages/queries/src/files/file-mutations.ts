import { gql } from "../__generated__";

export const CREATE_FILE_ENTRY = gql(/* GraphQL */ `
  mutation CreateFileEntry(
    $kind: FileEntryKind!
    $parentId: Int
    $name: String!
    $description: String
    $content: String
    $private: Boolean
    $root: Boolean
  ) {
    createFileEntry(
      kind: $kind
      parentId: $parentId
      name: $name
      description: $description
      content: $content
      private: $private
      root: $root
    ) {
      ...FileEntryFields
    }
  }
`);

export const UPDATE_FILE_ENTRY = gql(/* GraphQL */ `
  mutation UpdateFileEntry(
    $id: Int!
    $name: String
    $description: String
    $parentId: Int
    $private: Boolean
    $root: Boolean
  ) {
    updateFileEntry(
      id: $id
      name: $name
      description: $description
      parentId: $parentId
      private: $private
      root: $root
    ) {
      ...FileEntryFields
    }
  }
`);

export const DELETE_FILE_ENTRY = gql(/* GraphQL */ `
  mutation DeleteFileEntry($id: Int!, $recursive: Boolean = false) {
    deleteFileEntry(id: $id, recursive: $recursive)
  }
`);

export const WRITE_FILE_TEXT = gql(/* GraphQL */ `
  mutation WriteFileText($id: Int!, $content: String!) {
    writeFileText(id: $id, content: $content) {
      ...FileEntryFields
    }
  }
`);

export const UPLOAD_FILES = gql(/* GraphQL */ `
  mutation UploadFiles($files: [File!]!, $parentId: Int) {
    uploadFiles(files: $files, parentId: $parentId) {
      ...FileEntryFields
    }
  }
`);

export const INDEX_FILE_TREE = gql(/* GraphQL */ `
  mutation IndexFileTree($path: String, $apply: Boolean) {
    indexFileTree(path: $path, apply: $apply)
  }
`);
