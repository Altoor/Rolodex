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
    "\n  query systemOneScoreQuery(\n    $decisionType: String!\n    $instruction: String!\n    $options: [String!]!\n    $state: String!\n  ) {\n    systemOneScorePrompt(\n      decisionType: $decisionType\n      instruction: $instruction\n      options: $options\n      state: $state\n    ) {\n      answer\n      model\n    }\n  }\n": typeof types.SystemOneScoreQueryDocument,
    "\n  query systemOneNoulQuery(\n    $decisionType: String!\n    $instruction: String!\n    $state: String!\n  ) {\n    systemOneNoulPrompt(\n      decisionType: $decisionType\n      instruction: $instruction\n      state: $state\n    ) {\n      answer\n      model\n    }\n  }\n": typeof types.SystemOneNoulQueryDocument,
    "\n  query systemOneChoiceQuery(\n    $decisionType: String!\n    $instruction: String!\n    $options: [String!]!\n    $optionDescriptions: [String!]!\n    $state: String!\n  ) {\n    systemOneChoicePrompt(\n      decisionType: $decisionType\n      instruction: $instruction\n      options: $options\n      optionDescriptions: $optionDescriptions\n      state: $state\n    ) {\n      answer\n      model\n    }\n  }\n": typeof types.SystemOneChoiceQueryDocument,
    "\n  query GetModels {\n    models {\n      size_vram\n      size\n      name\n      model\n      details {\n        families\n        family\n        parameter_size\n      }\n    }\n  }\n": typeof types.GetModelsDocument,
    "\n  subscription PullModel($name: String!) {\n    installModel(name: $name) {\n      completed\n      digest\n      status\n      total\n    }\n  }\n": typeof types.PullModelDocument,
    "\n  mutation Login($email: String!, $password: String!) {\n    login(email: $email, password: $password)\n  }\n": typeof types.LoginDocument,
    "\n  mutation MyMutation($email: String!, $name: String!, $password: String!) {\n    createUser(email: $email, name: $name, password: $password)\n  }\n": typeof types.MyMutationDocument,
    "\n  query GetMe {\n    me {\n      email\n      id\n      name\n    }\n  }\n": typeof types.GetMeDocument,
};
const documents: Documents = {
    "\n  query systemOneScoreQuery(\n    $decisionType: String!\n    $instruction: String!\n    $options: [String!]!\n    $state: String!\n  ) {\n    systemOneScorePrompt(\n      decisionType: $decisionType\n      instruction: $instruction\n      options: $options\n      state: $state\n    ) {\n      answer\n      model\n    }\n  }\n": types.SystemOneScoreQueryDocument,
    "\n  query systemOneNoulQuery(\n    $decisionType: String!\n    $instruction: String!\n    $state: String!\n  ) {\n    systemOneNoulPrompt(\n      decisionType: $decisionType\n      instruction: $instruction\n      state: $state\n    ) {\n      answer\n      model\n    }\n  }\n": types.SystemOneNoulQueryDocument,
    "\n  query systemOneChoiceQuery(\n    $decisionType: String!\n    $instruction: String!\n    $options: [String!]!\n    $optionDescriptions: [String!]!\n    $state: String!\n  ) {\n    systemOneChoicePrompt(\n      decisionType: $decisionType\n      instruction: $instruction\n      options: $options\n      optionDescriptions: $optionDescriptions\n      state: $state\n    ) {\n      answer\n      model\n    }\n  }\n": types.SystemOneChoiceQueryDocument,
    "\n  query GetModels {\n    models {\n      size_vram\n      size\n      name\n      model\n      details {\n        families\n        family\n        parameter_size\n      }\n    }\n  }\n": types.GetModelsDocument,
    "\n  subscription PullModel($name: String!) {\n    installModel(name: $name) {\n      completed\n      digest\n      status\n      total\n    }\n  }\n": types.PullModelDocument,
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
export function gql(source: "\n  query systemOneScoreQuery(\n    $decisionType: String!\n    $instruction: String!\n    $options: [String!]!\n    $state: String!\n  ) {\n    systemOneScorePrompt(\n      decisionType: $decisionType\n      instruction: $instruction\n      options: $options\n      state: $state\n    ) {\n      answer\n      model\n    }\n  }\n"): (typeof documents)["\n  query systemOneScoreQuery(\n    $decisionType: String!\n    $instruction: String!\n    $options: [String!]!\n    $state: String!\n  ) {\n    systemOneScorePrompt(\n      decisionType: $decisionType\n      instruction: $instruction\n      options: $options\n      state: $state\n    ) {\n      answer\n      model\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query systemOneNoulQuery(\n    $decisionType: String!\n    $instruction: String!\n    $state: String!\n  ) {\n    systemOneNoulPrompt(\n      decisionType: $decisionType\n      instruction: $instruction\n      state: $state\n    ) {\n      answer\n      model\n    }\n  }\n"): (typeof documents)["\n  query systemOneNoulQuery(\n    $decisionType: String!\n    $instruction: String!\n    $state: String!\n  ) {\n    systemOneNoulPrompt(\n      decisionType: $decisionType\n      instruction: $instruction\n      state: $state\n    ) {\n      answer\n      model\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query systemOneChoiceQuery(\n    $decisionType: String!\n    $instruction: String!\n    $options: [String!]!\n    $optionDescriptions: [String!]!\n    $state: String!\n  ) {\n    systemOneChoicePrompt(\n      decisionType: $decisionType\n      instruction: $instruction\n      options: $options\n      optionDescriptions: $optionDescriptions\n      state: $state\n    ) {\n      answer\n      model\n    }\n  }\n"): (typeof documents)["\n  query systemOneChoiceQuery(\n    $decisionType: String!\n    $instruction: String!\n    $options: [String!]!\n    $optionDescriptions: [String!]!\n    $state: String!\n  ) {\n    systemOneChoicePrompt(\n      decisionType: $decisionType\n      instruction: $instruction\n      options: $options\n      optionDescriptions: $optionDescriptions\n      state: $state\n    ) {\n      answer\n      model\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  query GetModels {\n    models {\n      size_vram\n      size\n      name\n      model\n      details {\n        families\n        family\n        parameter_size\n      }\n    }\n  }\n"): (typeof documents)["\n  query GetModels {\n    models {\n      size_vram\n      size\n      name\n      model\n      details {\n        families\n        family\n        parameter_size\n      }\n    }\n  }\n"];
/**
 * The gql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function gql(source: "\n  subscription PullModel($name: String!) {\n    installModel(name: $name) {\n      completed\n      digest\n      status\n      total\n    }\n  }\n"): (typeof documents)["\n  subscription PullModel($name: String!) {\n    installModel(name: $name) {\n      completed\n      digest\n      status\n      total\n    }\n  }\n"];
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