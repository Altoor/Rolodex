"use client";

import { useMutation, useQuery } from "@apollo/client/react";

import { MODELS } from "@repo/queries/model/model-queries";
import ModelCard from "#components/models/modelCard";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { useForm, SubmitHandler } from "react-hook-form";
import { CREATE_MODEL_DESCRIPTION } from "@repo/queries/model/model-mutations";
import { Card, CardContent } from "#components/ui/card";
import { Button } from "#components/ui/button";
import { Input } from "#components/ui/input";
type Inputs = {
  name: string;
  description: string;
};
export default function ModelsPage() {
  const { data, error, loading } = useQuery(MODELS);
  const [createModelDescription] = useMutation(CREATE_MODEL_DESCRIPTION);

  const {
    register,
    handleSubmit,
    formState: { errors: formErrors },
  } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    await createModelDescription({
      variables: { name: inputs.name, description: inputs.description },
    });
  };

  return (
    <div className="flex h-full w-full items-center justify-center p-6 md:p-10">
      <Card>
        <CardContent>
          <div className="w-full max-w-sm">
            {data ? (
              data.models?.map((model) => {
                if (model.name) {
                  return (
                    <ModelCard
                      name={model.name}
                      description={model.description}
                      size={model.size as bigint}
                      key={model.name}
                      pulled={model.pulled}
                      capabilities={model.capabilities}
                    ></ModelCard>
                  );
                }
              })
            ) : (
              <div>No models</div>
            )}

            <form onSubmit={handleSubmit(onSubmit)}>
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <FieldGroup className="flex flex-row">
                  <Input {...register("name")} />
                  <Field className="w-fit">
                    <FieldError errors={[error]}></FieldError>
                    <Button type="submit">
                      {loading ? <Spinner /> : "Pull new model"}
                    </Button>
                  </Field>
                </FieldGroup>
              </Field>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
