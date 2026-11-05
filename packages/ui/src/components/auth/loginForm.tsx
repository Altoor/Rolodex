"use client";
import { cn } from "cn";

import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "../ui/field";
import { Input } from "../ui/input";
import { useMutation } from "@apollo/client/react";
import { SubmitHandler, useForm } from "react-hook-form";
import { Spinner } from "#components/ui/spinner";
import { LOGIN } from "@repo/queries/user/user-mutations";
import { useAuth } from "./auth-provider";

type Inputs = {
  email: string;
  password: string;
};

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [login, { loading, error }] = useMutation(LOGIN);
  const { setToken } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    const res = await login({
      variables: { email: inputs.email, password: inputs.password },
    });

    if (res.data?.login) {
      await setToken(res.data.login);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Login to your account</CardTitle>
          <CardDescription>
            Enter your email below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  {...register("email", { required: "Email is required" })}
                />
                <FieldError errors={[errors.email]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  {...register("password", {
                    required: "Password is required",
                  })}
                />
                <FieldError errors={[errors.password]} />
              </Field>
              <Field>
                <FieldError errors={[error]} />
                <Button type="submit">{loading ? <Spinner /> : "Login"}</Button>
                <FieldDescription className="text-center">
                  Don&apos;t have an account? <a href="/signUp">Sign up</a>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
