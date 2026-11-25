import { gql } from "../__generated__";

export const API_ENDPOINTS = gql(/* GraphQL */ `
  query ApiEndpoints {
    apiEndpoints {
      id
      name
      description
      slug
      taskId
      keyPrefix
      keyLastFour
      stateField
      enabled
      createdAt
      updatedAt
      task {
        id
        name
      }
    }
  }
`);

export const API_REQUESTS = gql(/* GraphQL */ `
  query ApiRequests($endpointId: ID!, $limit: Int) {
    apiRequests(endpointId: $endpointId, limit: $limit) {
      id
      endpointId
      runId
      createdAt
      status
    }
  }
`);

export const CREATE_API_ENDPOINT = gql(/* GraphQL */ `
  mutation CreateApiEndpoint(
    $name: String!
    $taskId: Int!
    $description: String
    $stateField: String
  ) {
    createApiEndpoint(
      name: $name
      taskId: $taskId
      description: $description
      stateField: $stateField
    ) {
      endpoint {
        id
        name
        description
        slug
        taskId
        keyPrefix
        keyLastFour
        stateField
        enabled
        createdAt
        updatedAt
        task {
          id
          name
        }
      }
      apiKey
    }
  }
`);

export const UPDATE_API_ENDPOINT = gql(/* GraphQL */ `
  mutation UpdateApiEndpoint(
    $id: ID!
    $name: String
    $description: String
    $taskId: Int
    $stateField: String
    $enabled: Boolean
  ) {
    updateApiEndpoint(
      id: $id
      name: $name
      description: $description
      taskId: $taskId
      stateField: $stateField
      enabled: $enabled
    ) {
      id
      name
      description
      slug
      taskId
      keyPrefix
      keyLastFour
      stateField
      enabled
      createdAt
      updatedAt
      task {
        id
        name
      }
    }
  }
`);

export const ROTATE_API_ENDPOINT_KEY = gql(/* GraphQL */ `
  mutation RotateApiEndpointKey($id: ID!) {
    rotateApiEndpointKey(id: $id) {
      endpoint {
        id
        name
        description
        slug
        taskId
        keyPrefix
        keyLastFour
        stateField
        enabled
        createdAt
        updatedAt
        task {
          id
          name
        }
      }
      apiKey
    }
  }
`);

export const DELETE_API_ENDPOINT = gql(/* GraphQL */ `
  mutation DeleteApiEndpoint($id: ID!) {
    deleteApiEndpoint(id: $id)
  }
`);
