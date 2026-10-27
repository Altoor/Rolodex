import HeaderMenu from "@repo/ui/components/headerMenu/headerMenu";
import GraphQlProvider from "./GraphQlProvider";

export default function App({ children }: { children: React.ReactNode }) {
  return (
    <GraphQlProvider>
      <HeaderMenu></HeaderMenu>
      {children}
    </GraphQlProvider>
  );
}
