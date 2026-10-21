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
import { Field, FieldError, FieldGroup, FieldLabel } from "../ui/field";
import { Input } from "../ui/input";
import { useMutation } from "@apollo/client/react";
import { Spinner } from "#components/ui/spinner";
import { CREATEUSER } from "@repo/queries/user/user-mutations";

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

  const {
    register,
    handleSubmit,
    formState: { errors: formErrors },
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
      localStorage.setItem("auth_token", res.data.createUser);
    }
    window.location.reload();
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Create a new accoung</CardTitle>
          <CardDescription>
            please enter the following information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input {...register("name", { required: true })} />
              </Field>
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
                <Button type="submit">
                  {loading ? <Spinner /> : "Create account"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
