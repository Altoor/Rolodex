import { gql } from "../__generated__";

export const TODO_FIELDS = gql(/* GraphQL */ `
  fragment TodoFields on Todo {
    id
    name
    description
    done
    doByDate
    createdAt
    archivedAt
    archived
    authorId
    actorId
  }
`);

export const GET_TODOS = gql(/* GraphQL */ `
  query GetTodos($includeArchived: Boolean = false) {
    getTodos(includeArchived: $includeArchived) {
      ...TodoFields
    }
  }
`);
