
"use client"
import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";

const client = new ApolloClient({
  ssrMode: true,
  link: new HttpLink({ uri: "http://localhost:4000/graphql", headers: {} }), // Authorization: `Bearer ${localStorage.getItem("token")}`
  cache: new InMemoryCache(),
});

interface IGraphQlProviderProps {
    children: React.ReactNode; 
}

const GraphQlProvider: React.FC<IGraphQlProviderProps> = ({
    children
}) => {
    return (
        <ApolloProvider client={client}>
            {children}
        </ApolloProvider>

    )
}

export default GraphQlProvider; 