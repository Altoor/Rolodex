"use client";

import { usePathname } from "next/navigation";
import HeaderMenu from "@repo/ui/components/headerMenu/headerMenu";
import { AuthProvider } from "@repo/ui/components/auth/auth-provider";
import GraphQlProvider from "./GraphQlProvider";

export default function App({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <GraphQlProvider>
      <AuthProvider>
        <HeaderMenu currentPath={pathname} />
        <main className="w-full">{children}</main>
      </AuthProvider>
    </GraphQlProvider>
  );
}
