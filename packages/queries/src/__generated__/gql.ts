/* eslint-disable */
import * as types from './graphql';
import { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';

/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  mutation createSystemOneChoiceDescision(\n    $decisionPremise: String!\n    $instruction: String!\n    $type: DecisionType!\n    $name: String!\n    $options: [String!]\n    $optionDescriptions: [String!]\n  ) {\n    createDecision(\n      decisionPremise: $decisionPremise\n      instruction: $instruction\n      type: $type\n      name: $name\n      options: $options\n      optionDescriptions: $optionDescriptions\n    ) {\n      id\n      decisionPremise\n      instruction\n      name\n      optionDescriptions\n      options\n      type\n    }\n  }\n": typeof types.CreateSystemOneChoiceDescisionDocument,
    "\n  mutation updateSystemOneChoiceDescision(\n    $id: Int!\n    $decisionPremise: String\n    $instruction: String\n    $type: DecisionType\n    $name: String\n    $options: [String!]\n    $optionDescriptions: [String!]\n  ) {\n    updateDecision(\n      id: $id\n      decisionPremise: $decisionPremise\n      instruction: $instruction\n      type: $type\n      name: $name\n      options: $options\n      optionDescriptions: $optionDescriptions\n    ) {\n      id\n      decisionPremise\n      instruction\n      name\n      optionDescriptions\n      options\n      type\n    }\n  }\n": typeof types.UpdateSystemOneChoiceDescisionDocument,
    "\n  mutation deleteSystemOneChoiceDescision($id: Int!) {\n    deleteDecision(id: $id)\n  }\n": typeof types.DeleteSystemOneChoiceDescisionDocument,
    "\n  query systemOneChoiceQuery(\n    $decisionPremise: String!\n    $instruction: String!\n    $type: DecisionType!\n    $state: String!\n    $options: [String!]\n    $optionDescriptions: [String!]\n  ) {\n    systemOnePrompt(\n      decisionPremise: $decisionPremise\n      instruction: $instruction\n      type: $type\n      state: $state\n      options: $options\n      optionDescriptions: $optionDescriptions\n    ) {\n      answer\n      model\n    }\n  }\n": typeof types.SystemOneChoiceQueryDocument,
    "\n  query Decisions {\n    decisions {\n      type\n      name\n      instruction\n      id\n      decisionPremise\n    }\n  }\n": typeof types.DecisionsDocument,
    "\n  query Decision($id: Int!) {\n    getDecision(id: $id) {\n      type\n      options\n      optionDescriptions\n      name\n      instruction\n      id\n      decisionPremise\n    }\n  }\n": typeof types.DecisionDocument,
    "\n  mutation UpdateModelDescription($name: String!, $description: String!) {\n    updateModel(name: $name, description: $description) {\n      size\n      name\n      description\n      model\n      capabilities\n      pulled\n    }\n  }\n": typeof types.UpdateModelDescriptionDocument,
    "\n  mutation CreateModelDescription($name: String!, $description: String) {\n    createModel(name: $name, description: $description) {\n      size\n      name\n      description\n      model\n      capabilities\n      pulled\n    }\n  }\n": typeof types.CreateModelDescriptionDocument,
    "\n  query GetModels {\n    models {\n      size\n      name\n      description\n      model\n      capabilities\n      pulled\n    }\n  }\n": typeof types.GetModelsDocument,
    "\n  subscription PullModel($name: String!) {\n    installModel(name: $name) {\n      completed\n      digest\n      status\n      total\n    }\n  }\n": typeof types.PullModelDocument,
    "\n  mutation CreateTask($name: String!, $type: TaskType!, $decisionId: Int) {\n    createTask(name: $name, type: $type, decisionId: $decisionId) {\n      id\n      name\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n": typeof types.CreateTaskDocument,
    "\n  mutation UpdateTask(\n    $id: Int!\n    $name: String\n    $type: TaskType\n    $decisionId: Int\n  ) {\n    updateTask(id: $id, name: $name, type: $type, decisionId: $decisionId) {\n      id\n      name\n      type\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n": typeof types.UpdateTaskDocument,
    "\n  mutation DeleteTask($id: Int!) {\n    deleteTask(id: $id)\n  }\n": typeof types.DeleteTaskDocument,
    "\n  mutation CreateTaskResult(\n    $type: DecisionType!\n    $taskId: Int!\n    $confidenceThreshold: Float!\n    $probabilityThreshold: Float\n    $scoreThreshold: Float\n    $resultTaskId: Int\n    $option: String\n  ) {\n    createTaskResult(\n      type: $type\n      taskId: $taskId\n      confidenceThreshold: $confidenceThreshold\n      probabilityThreshold: $probabilityThreshold\n      scoreThreshold: $scoreThreshold\n      resultTaskId: $resultTaskId\n      option: $option\n    ) {\n      confidenceThreshold\n      id\n      option\n      probabilityThreshold\n      resultTaskId\n      scoreThreshold\n      taskId\n      type\n    }\n  }\n": typeof types.CreateTaskResultDocument,
    "\n  mutation UpdateTaskResult(\n    $id: Int!\n    $type: DecisionType\n    $taskId: Int\n    $confidenceThreshold: Float\n    $probabilityThreshold: Float\n    $scoreThreshold: Float\n    $resultTaskId: Int\n    $option: String\n  ) {\n    updateTaskResult(\n      id: $id\n      type: $type\n      taskId: $taskId\n      confidenceThreshold: $confidenceThreshold\n      probabilityThreshold: $probabilityThreshold\n      scoreThreshold: $scoreThreshold\n      resultTaskId: $resultTaskId\n      option: $option\n    ) {\n      confidenceThreshold\n      id\n      option\n      probabilityThreshold\n      resultTaskId\n      scoreThreshold\n      taskId\n      type\n    }\n  }\n": typeof types.UpdateTaskResultDocument,
    "\n  mutation DeleteTaskResult($id: Int!) {\n    deleteTaskResult(id: $id)\n  }\n": typeof types.DeleteTaskResultDocument,
    "\n  query GetTasks {\n    tasks {\n      id\n      name\n      type\n      taskResults {\n        confidenceThreshold\n        id\n        option\n        probabilityThreshold\n        resultTaskId\n        scoreThreshold\n        type\n        taskId\n      }\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n": typeof types.GetTasksDocument,
    "\n  query GetTask($id: Int!) {\n    getTask(id: $id) {\n      id\n      name\n      type\n      taskResults {\n        type\n        taskId\n        scoreThreshold\n        resultTaskId\n        confidenceThreshold\n        id\n        option\n        probabilityThreshold\n      }\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n": typeof types.GetTaskDocument,
    "\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password)\n  }\n": typeof types.LoginDocument,
    "\n  mutation MyMutation($email: String!, $name: String!, $password: String!) {\n    createUser(email: $email, name: $name, password: $password)\n  }\n": typeof types.MyMutationDocument,
    "\n  query GetMe {\n    me {\n      email\n      id\n      name\n    }\n  }\n": typeof types.GetMeDocument,
};
const documents: Documents = {
    "\n  mutation createSystemOneChoiceDescision(\n    $decisionPremise: String!\n    $instruction: String!\n    $type: DecisionType!\n    $name: String!\n    $options: [String!]\n    $optionDescriptions: [String!]\n  ) {\n    createDecision(\n      decisionPremise: $decisionPremise\n      instruction: $instruction\n      type: $type\n      name: $name\n      options: $options\n      optionDescriptions: $optionDescriptions\n    ) {\n      id\n      decisionPremise\n      instruction\n      name\n      optionDescriptions\n      options\n      type\n    }\n  }\n": types.CreateSystemOneChoiceDescisionDocument,
    "\n  mutation updateSystemOneChoiceDescision(\n    $id: Int!\n    $decisionPremise: String\n    $instruction: String\n    $type: DecisionType\n    $name: String\n    $options: [String!]\n    $optionDescriptions: [String!]\n  ) {\n    updateDecision(\n      id: $id\n      decisionPremise: $decisionPremise\n      instruction: $instruction\n      type: $type\n      name: $name\n      options: $options\n      optionDescriptions: $optionDescriptions\n    ) {\n      id\n      decisionPremise\n      instruction\n      name\n      optionDescriptions\n      options\n      type\n    }\n  }\n": types.UpdateSystemOneChoiceDescisionDocument,
    "\n  mutation deleteSystemOneChoiceDescision($id: Int!) {\n    deleteDecision(id: $id)\n  }\n": types.DeleteSystemOneChoiceDescisionDocument,
    "\n  query systemOneChoiceQuery(\n    $decisionPremise: String!\n    $instruction: String!\n    $type: DecisionType!\n    $state: String!\n    $options: [String!]\n    $optionDescriptions: [String!]\n  ) {\n    systemOnePrompt(\n      decisionPremise: $decisionPremise\n      instruction: $instruction\n      type: $type\n      state: $state\n      options: $options\n      optionDescriptions: $optionDescriptions\n    ) {\n      answer\n      model\n    }\n  }\n": types.SystemOneChoiceQueryDocument,
    "\n  query Decisions {\n    decisions {\n      type\n      name\n      instruction\n      id\n      decisionPremise\n    }\n  }\n": types.DecisionsDocument,
    "\n  query Decision($id: Int!) {\n    getDecision(id: $id) {\n      type\n      options\n      optionDescriptions\n      name\n      instruction\n      id\n      decisionPremise\n    }\n  }\n": types.DecisionDocument,
    "\n  mutation UpdateModelDescription($name: String!, $description: String!) {\n    updateModel(name: $name, description: $description) {\n      size\n      name\n      description\n      model\n      capabilities\n      pulled\n    }\n  }\n": types.UpdateModelDescriptionDocument,
    "\n  mutation CreateModelDescription($name: String!, $description: String) {\n    createModel(name: $name, description: $description) {\n      size\n      name\n      description\n      model\n      capabilities\n      pulled\n    }\n  }\n": types.CreateModelDescriptionDocument,
    "\n  query GetModels {\n    models {\n      size\n      name\n      description\n      model\n      capabilities\n      pulled\n    }\n  }\n": types.GetModelsDocument,
    "\n  subscription PullModel($name: String!) {\n    installModel(name: $name) {\n      completed\n      digest\n      status\n      total\n    }\n  }\n": types.PullModelDocument,
    "\n  mutation CreateTask($name: String!, $type: TaskType!, $decisionId: Int) {\n    createTask(name: $name, type: $type, decisionId: $decisionId) {\n      id\n      name\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n": types.CreateTaskDocument,
    "\n  mutation UpdateTask(\n    $id: Int!\n    $name: String\n    $type: TaskType\n    $decisionId: Int\n  ) {\n    updateTask(id: $id, name: $name, type: $type, decisionId: $decisionId) {\n      id\n      name\n      type\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n": types.UpdateTaskDocument,
    "\n  mutation DeleteTask($id: Int!) {\n    deleteTask(id: $id)\n  }\n": types.DeleteTaskDocument,
    "\n  mutation CreateTaskResult(\n    $type: DecisionType!\n    $taskId: Int!\n    $confidenceThreshold: Float!\n    $probabilityThreshold: Float\n    $scoreThreshold: Float\n    $resultTaskId: Int\n    $option: String\n  ) {\n    createTaskResult(\n      type: $type\n      taskId: $taskId\n      confidenceThreshold: $confidenceThreshold\n      probabilityThreshold: $probabilityThreshold\n      scoreThreshold: $scoreThreshold\n      resultTaskId: $resultTaskId\n      option: $option\n    ) {\n      confidenceThreshold\n      id\n      option\n      probabilityThreshold\n      resultTaskId\n      scoreThreshold\n      taskId\n      type\n    }\n  }\n": types.CreateTaskResultDocument,
    "\n  mutation UpdateTaskResult(\n    $id: Int!\n    $type: DecisionType\n    $taskId: Int\n    $confidenceThreshold: Float\n    $probabilityThreshold: Float\n    $scoreThreshold: Float\n    $resultTaskId: Int\n    $option: String\n  ) {\n    updateTaskResult(\n      id: $id\n      type: $type\n      taskId: $taskId\n      confidenceThreshold: $confidenceThreshold\n      probabilityThreshold: $probabilityThreshold\n      scoreThreshold: $scoreThreshold\n      resultTaskId: $resultTaskId\n      option: $option\n    ) {\n      confidenceThreshold\n      id\n      option\n      probabilityThreshold\n      resultTaskId\n      scoreThreshold\n      taskId\n      type\n    }\n  }\n": types.UpdateTaskResultDocument,
    "\n  mutation DeleteTaskResult($id: Int!) {\n    deleteTaskResult(id: $id)\n  }\n": types.DeleteTaskResultDocument,
    "\n  query GetTasks {\n    tasks {\n      id\n      name\n      type\n      taskResults {\n        confidenceThreshold\n        id\n        option\n        probabilityThreshold\n        resultTaskId\n        scoreThreshold\n        type\n        taskId\n      }\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n": types.GetTasksDocument,
    "\n  query GetTask($id: Int!) {\n    getTask(id: $id) {\n      id\n      name\n      type\n      taskResults {\n        type\n        taskId\n        scoreThreshold\n        resultTaskId\n        confidenceThreshold\n        id\n        option\n        probabilityThreshold\n      }\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n": types.GetTaskDocument,
    "\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password)\n  }\n": types.LoginDocument,
    "\n  mutation MyMutation($email: String!, $name: String!, $password: String!) {\n    createUser(email: $email, name: $name, password: $password)\n  }\n": types.MyMutationDocument,
    "\n  query GetMe {\n    me {\n      email\n      id\n      name\n    }\n  }\n": types.GetMeDocument,
};

/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 *
 *
 * @example
 * ```ts
 * const query = gql(`query GetUser($id: ID!) { user(id: $id) { name } }`);
 * ```
 *
 * The query argument is unknown!
 * Please regenerate the types.
 */
export function gql(source: string): unknown;

/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation createSystemOneChoiceDescision(\n    $decisionPremise: String!\n    $instruction: String!\n    $type: DecisionType!\n    $name: String!\n    $options: [String!]\n    $optionDescriptions: [String!]\n  ) {\n    createDecision(\n      decisionPremise: $decisionPremise\n      instruction: $instruction\n      type: $type\n      name: $name\n      options: $options\n      optionDescriptions: $optionDescriptions\n    ) {\n      id\n      decisionPremise\n      instruction\n      name\n      optionDescriptions\n      options\n      type\n    }\n  }\n"): (typeof documents)["\n  mutation createSystemOneChoiceDescision(\n    $decisionPremise: String!\n    $instruction: String!\n    $type: DecisionType!\n    $name: String!\n    $options: [String!]\n    $optionDescriptions: [String!]\n  ) {\n    createDecision(\n      decisionPremise: $decisionPremise\n      instruction: $instruction\n      type: $type\n      name: $name\n      options: $options\n      optionDescriptions: $optionDescriptions\n    ) {\n      id\n      decisionPremise\n      instruction\n      name\n      optionDescriptions\n      options\n      type\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation updateSystemOneChoiceDescision(\n    $id: Int!\n    $decisionPremise: String\n    $instruction: String\n    $type: DecisionType\n    $name: String\n    $options: [String!]\n    $optionDescriptions: [String!]\n  ) {\n    updateDecision(\n      id: $id\n      decisionPremise: $decisionPremise\n      instruction: $instruction\n      type: $type\n      name: $name\n      options: $options\n      optionDescriptions: $optionDescriptions\n    ) {\n      id\n      decisionPremise\n      instruction\n      name\n      optionDescriptions\n      options\n      type\n    }\n  }\n"): (typeof documents)["\n  mutation updateSystemOneChoiceDescision(\n    $id: Int!\n    $decisionPremise: String\n    $instruction: String\n    $type: DecisionType\n    $name: String\n    $options: [String!]\n    $optionDescriptions: [String!]\n  ) {\n    updateDecision(\n      id: $id\n      decisionPremise: $decisionPremise\n      instruction: $instruction\n      type: $type\n      name: $name\n      options: $options\n      optionDescriptions: $optionDescriptions\n    ) {\n      id\n      decisionPremise\n      instruction\n      name\n      optionDescriptions\n      options\n      type\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation deleteSystemOneChoiceDescision($id: Int!) {\n    deleteDecision(id: $id)\n  }\n"): (typeof documents)["\n  mutation deleteSystemOneChoiceDescision($id: Int!) {\n    deleteDecision(id: $id)\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query systemOneChoiceQuery(\n    $decisionPremise: String!\n    $instruction: String!\n    $type: DecisionType!\n    $state: String!\n    $options: [String!]\n    $optionDescriptions: [String!]\n  ) {\n    systemOnePrompt(\n      decisionPremise: $decisionPremise\n      instruction: $instruction\n      type: $type\n      state: $state\n      options: $options\n      optionDescriptions: $optionDescriptions\n    ) {\n      answer\n      model\n    }\n  }\n"): (typeof documents)["\n  query systemOneChoiceQuery(\n    $decisionPremise: String!\n    $instruction: String!\n    $type: DecisionType!\n    $state: String!\n    $options: [String!]\n    $optionDescriptions: [String!]\n  ) {\n    systemOnePrompt(\n      decisionPremise: $decisionPremise\n      instruction: $instruction\n      type: $type\n      state: $state\n      options: $options\n      optionDescriptions: $optionDescriptions\n    ) {\n      answer\n      model\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query Decisions {\n    decisions {\n      type\n      name\n      instruction\n      id\n      decisionPremise\n    }\n  }\n"): (typeof documents)["\n  query Decisions {\n    decisions {\n      type\n      name\n      instruction\n      id\n      decisionPremise\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query Decision($id: Int!) {\n    getDecision(id: $id) {\n      type\n      options\n      optionDescriptions\n      name\n      instruction\n      id\n      decisionPremise\n    }\n  }\n"): (typeof documents)["\n  query Decision($id: Int!) {\n    getDecision(id: $id) {\n      type\n      options\n      optionDescriptions\n      name\n      instruction\n      id\n      decisionPremise\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation UpdateModelDescription($name: String!, $description: String!) {\n    updateModel(name: $name, description: $description) {\n      size\n      name\n      description\n      model\n      capabilities\n      pulled\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateModelDescription($name: String!, $description: String!) {\n    updateModel(name: $name, description: $description) {\n      size\n      name\n      description\n      model\n      capabilities\n      pulled\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation CreateModelDescription($name: String!, $description: String) {\n    createModel(name: $name, description: $description) {\n      size\n      name\n      description\n      model\n      capabilities\n      pulled\n    }\n  }\n"): (typeof documents)["\n  mutation CreateModelDescription($name: String!, $description: String) {\n    createModel(name: $name, description: $description) {\n      size\n      name\n      description\n      model\n      capabilities\n      pulled\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query GetModels {\n    models {\n      size\n      name\n      description\n      model\n      capabilities\n      pulled\n    }\n  }\n"): (typeof documents)["\n  query GetModels {\n    models {\n      size\n      name\n      description\n      model\n      capabilities\n      pulled\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  subscription PullModel($name: String!) {\n    installModel(name: $name) {\n      completed\n      digest\n      status\n      total\n    }\n  }\n"): (typeof documents)["\n  subscription PullModel($name: String!) {\n    installModel(name: $name) {\n      completed\n      digest\n      status\n      total\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation CreateTask($name: String!, $type: TaskType!, $decisionId: Int) {\n    createTask(name: $name, type: $type, decisionId: $decisionId) {\n      id\n      name\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation CreateTask($name: String!, $type: TaskType!, $decisionId: Int) {\n    createTask(name: $name, type: $type, decisionId: $decisionId) {\n      id\n      name\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation UpdateTask(\n    $id: Int!\n    $name: String\n    $type: TaskType\n    $decisionId: Int\n  ) {\n    updateTask(id: $id, name: $name, type: $type, decisionId: $decisionId) {\n      id\n      name\n      type\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateTask(\n    $id: Int!\n    $name: String\n    $type: TaskType\n    $decisionId: Int\n  ) {\n    updateTask(id: $id, name: $name, type: $type, decisionId: $decisionId) {\n      id\n      name\n      type\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation DeleteTask($id: Int!) {\n    deleteTask(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteTask($id: Int!) {\n    deleteTask(id: $id)\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation CreateTaskResult(\n    $type: DecisionType!\n    $taskId: Int!\n    $confidenceThreshold: Float!\n    $probabilityThreshold: Float\n    $scoreThreshold: Float\n    $resultTaskId: Int\n    $option: String\n  ) {\n    createTaskResult(\n      type: $type\n      taskId: $taskId\n      confidenceThreshold: $confidenceThreshold\n      probabilityThreshold: $probabilityThreshold\n      scoreThreshold: $scoreThreshold\n      resultTaskId: $resultTaskId\n      option: $option\n    ) {\n      confidenceThreshold\n      id\n      option\n      probabilityThreshold\n      resultTaskId\n      scoreThreshold\n      taskId\n      type\n    }\n  }\n"): (typeof documents)["\n  mutation CreateTaskResult(\n    $type: DecisionType!\n    $taskId: Int!\n    $confidenceThreshold: Float!\n    $probabilityThreshold: Float\n    $scoreThreshold: Float\n    $resultTaskId: Int\n    $option: String\n  ) {\n    createTaskResult(\n      type: $type\n      taskId: $taskId\n      confidenceThreshold: $confidenceThreshold\n      probabilityThreshold: $probabilityThreshold\n      scoreThreshold: $scoreThreshold\n      resultTaskId: $resultTaskId\n      option: $option\n    ) {\n      confidenceThreshold\n      id\n      option\n      probabilityThreshold\n      resultTaskId\n      scoreThreshold\n      taskId\n      type\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation UpdateTaskResult(\n    $id: Int!\n    $type: DecisionType\n    $taskId: Int\n    $confidenceThreshold: Float\n    $probabilityThreshold: Float\n    $scoreThreshold: Float\n    $resultTaskId: Int\n    $option: String\n  ) {\n    updateTaskResult(\n      id: $id\n      type: $type\n      taskId: $taskId\n      confidenceThreshold: $confidenceThreshold\n      probabilityThreshold: $probabilityThreshold\n      scoreThreshold: $scoreThreshold\n      resultTaskId: $resultTaskId\n      option: $option\n    ) {\n      confidenceThreshold\n      id\n      option\n      probabilityThreshold\n      resultTaskId\n      scoreThreshold\n      taskId\n      type\n    }\n  }\n"): (typeof documents)["\n  mutation UpdateTaskResult(\n    $id: Int!\n    $type: DecisionType\n    $taskId: Int\n    $confidenceThreshold: Float\n    $probabilityThreshold: Float\n    $scoreThreshold: Float\n    $resultTaskId: Int\n    $option: String\n  ) {\n    updateTaskResult(\n      id: $id\n      type: $type\n      taskId: $taskId\n      confidenceThreshold: $confidenceThreshold\n      probabilityThreshold: $probabilityThreshold\n      scoreThreshold: $scoreThreshold\n      resultTaskId: $resultTaskId\n      option: $option\n    ) {\n      confidenceThreshold\n      id\n      option\n      probabilityThreshold\n      resultTaskId\n      scoreThreshold\n      taskId\n      type\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation DeleteTaskResult($id: Int!) {\n    deleteTaskResult(id: $id)\n  }\n"): (typeof documents)["\n  mutation DeleteTaskResult($id: Int!) {\n    deleteTaskResult(id: $id)\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query GetTasks {\n    tasks {\n      id\n      name\n      type\n      taskResults {\n        confidenceThreshold\n        id\n        option\n        probabilityThreshold\n        resultTaskId\n        scoreThreshold\n        type\n        taskId\n      }\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetTasks {\n    tasks {\n      id\n      name\n      type\n      taskResults {\n        confidenceThreshold\n        id\n        option\n        probabilityThreshold\n        resultTaskId\n        scoreThreshold\n        type\n        taskId\n      }\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query GetTask($id: Int!) {\n    getTask(id: $id) {\n      id\n      name\n      type\n      taskResults {\n        type\n        taskId\n        scoreThreshold\n        resultTaskId\n        confidenceThreshold\n        id\n        option\n        probabilityThreshold\n      }\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetTask($id: Int!) {\n    getTask(id: $id) {\n      id\n      name\n      type\n      taskResults {\n        type\n        taskId\n        scoreThreshold\n        resultTaskId\n        confidenceThreshold\n        id\n        option\n        probabilityThreshold\n      }\n      decision {\n        id\n        options\n        type\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password)\n  }\n"): (typeof documents)["\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password)\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  mutation MyMutation($email: String!, $name: String!, $password: String!) {\n    createUser(email: $email, name: $name, password: $password)\n  }\n"): (typeof documents)["\n  mutation MyMutation($email: String!, $name: String!, $password: String!) {\n    createUser(email: $email, name: $name, password: $password)\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query GetMe {\n    me {\n      email\n      id\n      name\n    }\n  }\n"): (typeof documents)["\n  query GetMe {\n    me {\n      email\n      id\n      name\n    }\n  }\n"];

export function gql(source: string) {
  return (documents as any)[source] ?? {};
}

export type DocumentType<TDocumentNode extends DocumentNode<any, any>> = TDocumentNode extends DocumentNode<  infer TType,  any>  ? TType  : never;