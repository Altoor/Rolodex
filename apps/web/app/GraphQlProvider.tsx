"use client";
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from "@apollo/client/core";
import { ApolloProvider } from "@apollo/client/react";
import { getMainDefinition } from "@apollo/client/utilities";
import UploadHttpLink from "apollo-upload-client/UploadHttpLink.mjs";
import { print } from "graphql";
import {
  createClient,
  ClientOptions,
  Client,
  RequestParams,
} from "graphql-sse";

const GRAPHQL_URL = "http://localhost:4000/graphql";

function authHeaders(): Record<string, string> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;

  return token ? { Authorization: `Bearer ${token}` } : {};
}

class SSELink extends ApolloLink {
  private client: Client;
  private readonly operationsByRequest = new WeakMap<
    RequestParams,
    ApolloLink.Operation
  >();
  // Feel free to adjust the options type here to be what you need to be dynamic
  constructor(options: ClientOptions) {
    super();
    this.client = createClient({
      ...options,
      // Merge headers from each operation's context
      headers: async (request) => {
        const operation: ApolloLink.Operation =
          this.operationsByRequest.get(request)!;
        return {
          // This can be omitted if your created link's options don't include headers
          ...(typeof options.headers === "function"
            ? await options.headers(request)
            : options.headers),
          ...operation.getContext().headers,
        };
      },
    });
  }
  public request(
    operation: ApolloLink.Operation,
  ): Observable<ApolloLink.Result> {
    const request: RequestParams = {
      // This supports the persisted queries link to avoid sending printed query when cached
      variables: operation.variables,
      extensions: operation.extensions,
      operationName: operation.operationName,
      query:
        (operation.getContext().http?.includeQuery ?? true)
          ? print(operation.query)
          : undefined!,
    };
    this.operationsByRequest.set(request, operation);
    return new Observable((sink) => {
      return this.client.subscribe<ApolloLink.Result>(request, {
        next: (payload: unknown) => sink.next(payload as ApolloLink.Result),
        complete: sink.complete.bind(sink),
        error: sink.error.bind(sink),
      });
    });
  }
}
const sseLink = new SSELink({
  url: GRAPHQL_URL,
  headers: () => authHeaders(),
});

const authLink = new ApolloLink((operation, forward) => {
  operation.setContext({
    headers: {
      ...operation.getContext().headers,
      ...authHeaders(),
    },
  });

  return forward(operation);
});

const httpLink = authLink.concat(
  new UploadHttpLink({
    uri: GRAPHQL_URL,
  }),
);

export const link = ApolloLink.split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === "OperationDefinition" &&
      definition.operation === "subscription"
    );
  },
  sseLink,
  httpLink,
);

const client = new ApolloClient({
  ssrMode: typeof window === "undefined",
  link,
  cache: new InMemoryCache(),
});

interface IGraphQlProviderProps {
  children: React.ReactNode;
}

const GraphQlProvider: React.FC<IGraphQlProviderProps> = ({ children }) => {
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
};

export default GraphQlProvider;
