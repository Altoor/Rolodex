"use client";

import { EmptyState } from "#components/feedback/empty-state";
import { LoadingState } from "#components/feedback/loading-state";
import { useAuth } from "./auth-provider";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingState />;
  }

  if (!user) {
    return (
      <EmptyState
        title="Sign in required"
        description="Log in to use this page."
        actionHref="/user"
        actionLabel="Go to account"
      />
    );
  }

  return <>{children}</>;
}
