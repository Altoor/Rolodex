"use client";

import { Button } from "#components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "#components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#components/ui/field";
import { SubmitHandler, useForm } from "react-hook-form";
import { Input } from "#components/ui/input";
import { Spinner } from "#components/ui/spinner";
import { useLazyQuery } from "@apollo/client/react";
import { SYSTEM_ONE_NOUL_PROMPT } from "@repo/queries/decisions/decision-queries";

type Inputs = {
  instruction: string;
  state: string;
  decisionType: string;
};

const DecisionCard = () => {
  const [prompt, { loading, error, data }] = useLazyQuery(
    SYSTEM_ONE_NOUL_PROMPT,
  );

  const {
    register,
    handleSubmit,
    formState: { errors: formErrors },
    getValues,
  } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    prompt({
      variables: {
        instruction: inputs.instruction,
        state: inputs.state,
        decisionType: inputs.decisionType,
      },
    });
  };

  return (
    <Card className="min-w-2xl w-full">
      <CardHeader>
        <CardTitle>Decision</CardTitle>
        <CardDescription>Setup a decision</CardDescription>
      </CardHeader>
      <CardContent className="min-h-32">
        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="instruction">
                What is your current instruction
              </FieldLabel>
              <Input {...register("instruction", { required: true })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="decisionType">
                What is the premise of the decision
              </FieldLabel>
              <Input {...register("decisionType", { required: true })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="state">
                What is your current state
              </FieldLabel>
              <Input {...register("state", { required: true })} />
            </Field>
            <Field>
              <FieldError errors={[error]}></FieldError>
              <Button type="submit">{loading ? <Spinner /> : "Submit"}</Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        {loading ? (
          <Spinner />
        ) : (
          data && (
            <div>
              <div>
                How likely is the answer:{" "}
                <strong>
                  {
                    (data?.systemOneNoulPrompt?.answer as any)[
                      getValues().decisionType
                    ].noul
                  }
                </strong>
              </div>
              <FieldDescription>
                provided by {data?.systemOneNoulPrompt?.model as string}
              </FieldDescription>
            </div>
          )
        )}
      </CardFooter>
    </Card>
  );
};

export default DecisionCard;
