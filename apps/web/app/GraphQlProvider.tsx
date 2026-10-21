"use client";
import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { SetContextLink } from "@apollo/client/link/context";
import { ApolloProvider } from "@apollo/client/react";

const authLink = new SetContextLink((prevContext, operation) => {
  const token = localStorage.getItem("auth_token");
  return {
    headers: {
      ...prevContext.headers,
      authorization: token ? `Bearer ${token}` : "",
    },
  };
});

const client = new ApolloClient({
  ssrMode: true,
  link: authLink.concat(
    new HttpLink({ uri: "http://localhost:4000/graphql", headers: {} }),
  ), // Authorization: `Bearer ${localStorage.getItem("token")}`
  cache: new InMemoryCache(),
});

interface IGraphQlProviderProps {
  children: React.ReactNode;
}

const GraphQlProvider: React.FC<IGraphQlProviderProps> = ({ children }) => {
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
};

export default GraphQlProvider;
