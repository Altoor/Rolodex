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
import { Spinner } from "#components/ui/spinner";
import { CREATEUSER } from "@repo/queries/user/user-mutations";
import { SubmitHandler, useForm } from "react-hook-form";
import { useAuth } from "./auth-provider";

type Inputs = {
  email: string;
  name: string;
  password: string;
};

export function SignUpForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const [createUser, { loading, error }] = useMutation(CREATEUSER);
  const { setToken } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    const res = await createUser({
      variables: {
        email: inputs.email,
        name: inputs.name,
        password: inputs.password,
      },
    });

    if (res.data?.createUser) {
      await setToken(res.data.createUser);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Create a new account</CardTitle>
          <CardDescription>
            please enter the following information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input
                  id="name"
                  autoComplete="name"
                  {...register("name", { required: "Name is required" })}
                />
                <FieldError errors={[errors.name]} />
              </Field>
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
                  autoComplete="new-password"
                  {...register("password", {
                    required: "Password is required",
                  })}
                />
                <FieldError errors={[errors.password]} />
              </Field>
              <Field>
                <FieldError errors={[error]} />
                <Button type="submit">
                  {loading ? <Spinner /> : "Create account"}
                </Button>
                <FieldDescription className="text-center">
                  Already have an account? <a href="/login">Log in</a>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
