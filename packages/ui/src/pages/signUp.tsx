"use client";

import { SignUpForm } from "#components/auth/signUpForm";
import { useQuery } from "@apollo/client/react";

import { ME } from "@repo/queries/user/users-queries";

export default function LoginPage() {
  const { data } = useQuery(ME);

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        {data ? <div>Welcome {data.me?.name}</div> : <SignUpForm />}
      </div>
    </div>
  );
}
