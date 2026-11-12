declare module "apollo-upload-client/UploadHttpLink.mjs" {
  import type { ApolloLink } from "@apollo/client/link";

  export interface UploadHttpLinkOptions {
    uri?: string;
    useGETForQueries?: boolean;
    headers?: Record<string, string>;
    fetchOptions?: RequestInit;
    credentials?: RequestCredentials;
    includeExtensions?: boolean;
    includeUnusedVariables?: boolean;
  }

  export default class UploadHttpLink extends ApolloLink {
    constructor(options?: UploadHttpLinkOptions);
  }
}
