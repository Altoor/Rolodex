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

type Inputs = {
  email: string;
  password: string;
};

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [login, { loading, error }] = useMutation(LOGIN);

  const {
    register,
    handleSubmit,
    formState: { errors: formErrors },
  } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    const res = await login({
      variables: { email: inputs.email, password: inputs.password },
    });

    if (res.data?.login) {
      localStorage.setItem("auth_token", res.data.login);
    }
    window.location.reload();
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
                <Input {...register("email", { required: true })} />
              </Field>
              <Field>
                <div className="flex items-center">
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <a
                    href="#"
                    className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
                  >
                    Forgot your password?
                  </a>
                </div>
                <Input {...register("password", { required: true })} />
              </Field>
              <Field>
                <FieldError errors={[error]}></FieldError>
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
