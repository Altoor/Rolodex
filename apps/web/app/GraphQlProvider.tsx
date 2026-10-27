"use client";
import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from "@apollo/client/core";
import { ApolloProvider } from "@apollo/client/react";
import { print } from "graphql";
import {
  createClient,
  ClientOptions,
  Client,
  RequestParams,
} from "graphql-sse";

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
        next: (payload: any) => sink.next(payload as ApolloLink.Result),
        complete: sink.complete.bind(sink),
        error: sink.error.bind(sink),
      });
    });
  }
}
export const link = new SSELink({
  url: "http://localhost:4000/graphql",
  headers: () => {
    const token = localStorage.getItem("auth_token");
    return {
      Authorization: token ? `Bearer ${token}` : "",
    };
  },
});

const client = new ApolloClient({
  ssrMode: true,
  link: link,
  cache: new InMemoryCache(),
});

interface IGraphQlProviderProps {
  children: React.ReactNode;
}

const GraphQlProvider: React.FC<IGraphQlProviderProps> = ({ children }) => {
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
};

export default GraphQlProvider;
