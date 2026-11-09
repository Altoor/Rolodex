import { gql } from "../__generated__";

export const TODO_FIELDS = gql(/* GraphQL */ `
  fragment TodoFields on Todo {
    id
    name
    description
    done
    doByDate
    authorId
    actorId
  }
`);

export const GET_TODOS = gql(/* GraphQL */ `
  query GetTodos {
    getTodos {
      ...TodoFields
    }
  }
`);
