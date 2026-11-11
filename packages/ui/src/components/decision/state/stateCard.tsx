"use client";

import { Button } from "#components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Spinner } from "#components/ui/spinner";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#components/ui/card";
import { SubmitHandler, useForm } from "react-hook-form";
import SystemOneResult from "./systemOneResult";
import { useSystemOnePreview } from "./useSystemOnePreview";

type Inputs = {
  state: string;
};

const StateCard = () => {
  const { run, loading, error, answer, decisionPremise } =
    useSystemOnePreview();
  const { register, handleSubmit } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = (inputs) => run(inputs.state);

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Try the prompt</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="state">
                What is your current state?
              </FieldLabel>
              <Input id="state" {...register("state", { required: true })} />
            </Field>
            <Field>
              <FieldError errors={[error]} />
              <Button type="submit" disabled={loading}>
                {loading ? <Spinner /> : "Submit"}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter>
        {loading ? <Spinner /> : null}
        {!loading && answer ? (
          <div className="flex w-full flex-wrap gap-2">
            <SystemOneResult
              answer={answer}
              decisionPremise={decisionPremise}
            />
          </div>
        ) : null}
      </CardFooter>
    </Card>
  );
};

export default StateCard;
