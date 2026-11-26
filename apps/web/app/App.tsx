"use client";

import { usePathname } from "next/navigation";
import HeaderMenu from "@repo/ui/components/headerMenu/headerMenu";
import { AuthProvider } from "@repo/ui/components/auth/auth-provider";
import { ApiOriginProvider } from "@repo/ui/lib/apiOriginContext";
import GraphQlProvider from "./GraphQlProvider";

interface AppProps {
  /** Runtime API_PUBLIC_ORIGIN from the root layout. */
  apiOrigin: string;
  children: React.ReactNode;
}

export default function App({ apiOrigin, children }: AppProps) {
  const pathname = usePathname();

  return (
    <ApiOriginProvider apiOrigin={apiOrigin}>
      <GraphQlProvider>
        <AuthProvider>
          <HeaderMenu currentPath={pathname} />
          <main className="w-full">{children}</main>
        </AuthProvider>
      </GraphQlProvider>
    </ApiOriginProvider>
  );
}
