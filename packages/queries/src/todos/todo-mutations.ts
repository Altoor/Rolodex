import { gql } from "../__generated__";

export const CREATE_TODO = gql(/* GraphQL */ `
  mutation CreateTodo(
    $name: String!
    $description: String
    $doByDate: DateTime
    $actor_id: Int
  ) {
    createTodo(
      name: $name
      description: $description
      doByDate: $doByDate
      actor_id: $actor_id
    ) {
      ...TodoFields
    }
  }
`);

export const UPDATE_TODO = gql(/* GraphQL */ `
  mutation UpdateTodo(
    $id: Int!
    $name: String
    $description: String
    $doByDate: DateTime
    $actor_id: Int
  ) {
    updateTodo(
      id: $id
      name: $name
      description: $description
      doByDate: $doByDate
      actor_id: $actor_id
    ) {
      ...TodoFields
    }
  }
`);

export const MARK_TODO_DONE = gql(/* GraphQL */ `
  mutation MarkTodoDone($id: Int!, $done: Boolean!) {
    markTodoDone(id: $id, done: $done) {
      ...TodoFields
    }
  }
`);

export const DELETE_TODO = gql(/* GraphQL */ `
  mutation DeleteTodo($id: Int!) {
    deleteTodo(id: $id)
  }
`);

export const ARCHIVE_TODO = gql(/* GraphQL */ `
  mutation ArchiveTodo($id: Int!, $archived: Boolean) {
    archiveTodo(id: $id, archived: $archived) {
      ...TodoFields
    }
  }
`);
