'use client'

import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";

const client = new ApolloClient({
  link: new HttpLink({ uri: "http://localhost:4000/graphql", headers: {} }), // Authorization: `Bearer ${localStorage.getItem("token")}`
  cache: new InMemoryCache(),
});

export default function App({
  children,
}: {
  children: React.ReactNode;
}) {

    return(
        <ApolloProvider client={client}>
           {children}
        </ApolloProvider>
        )

}
