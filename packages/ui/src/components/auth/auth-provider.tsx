"use client";

import { createContext, useContext, useMemo } from "react";
import { useQuery } from "@apollo/client/react";
import { ME } from "@repo/queries/user/users-queries";

export interface CurrentUser {
  id: number;
  name: string;
  email: string;
  settings: {
    defaultTaskId: number | null;
    defaultModelName: string | null;
  } | null;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  setToken: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { data, loading, client } = useQuery(ME, {
    fetchPolicy: "cache-and-network",
  });

  const value = useMemo<AuthContextValue>(
    () => ({
      user: (data?.me as CurrentUser | null | undefined) ?? null,
      loading,
      setToken: async (token) => {
        window.localStorage.setItem("auth_token", token);
        await client.resetStore();
      },
      logout: async () => {
        window.localStorage.removeItem("auth_token");
        await client.clearStore();
        window.location.assign("/user");
      },
    }),
    [data?.me, loading, client],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
