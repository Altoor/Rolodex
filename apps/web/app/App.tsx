import GraphQlProvider from "./GraphQlProvider";


export default function App({
  children,
}: {
  children: React.ReactNode;
}) {

    return(
            <GraphQlProvider>
            {children}
            </GraphQlProvider>
        )

}
