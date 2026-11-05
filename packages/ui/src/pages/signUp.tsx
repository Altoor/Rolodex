"use client";

import { useAuth, type CurrentUser } from "../components/auth/auth-provider";
import { AuthLayout } from "../components/auth/auth-layout";
import { SignUpForm } from "../components/auth/signUpForm";
import { LoadingState } from "#components/feedback/loading-state";
import { buttonVariants } from "#components/ui/button";

export default function SignUpPage() {
  const { user, loading } = useAuth();

  return (
    <AuthLayout>
      {loading ? (
        <LoadingState />
      ) : user ? (
        <LoggedInNotice user={user} />
      ) : (
        <SignUpForm />
      )}
    </AuthLayout>
  );
}

function LoggedInNotice({ user }: { user: CurrentUser }) {
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <p>
        You are logged in as <strong>{user.name}</strong>.
      </p>
      <a href="/user" className={buttonVariants()}>
        Go to your account
      </a>
    </div>
  );
}
