"use client";

import { useMutation, useQuery } from "@apollo/client/react";

import { MODELS } from "@repo/queries/model/model-queries";
import { AuthGate } from "../components/auth/auth-gate";
import { EmptyState } from "#components/feedback/empty-state";
import { ErrorState } from "#components/feedback/error-state";
import { LoadingState } from "#components/feedback/loading-state";
import { PageContainer } from "#components/layout/page-container";
import { PageHeader } from "#components/layout/page-header";
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
};

export default function ModelsPage() {
  return (
    <AuthGate>
      <ModelsPageContent />
    </AuthGate>
  );
}

function ModelsPageContent() {
  const { data, error, loading } = useQuery(MODELS);
  const [createModelDescription, { loading: pulling, error: pullError }] =
    useMutation(CREATE_MODEL_DESCRIPTION, {
      refetchQueries: [MODELS],
    });

  const { register, handleSubmit, reset } = useForm<Inputs>();

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    const { error: mutationError } = await createModelDescription({
      variables: { name: inputs.name },
    });

    if (!mutationError) reset({ name: "" });
  };

  const models = data?.models ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Models"
        description="Pull models and describe what they are useful for."
      />

      <Card>
        <CardContent className="flex flex-col gap-4">
          <form onSubmit={handleSubmit(onSubmit)}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="model-name">
                  Pull a model by name
                </FieldLabel>
                <div className="flex flex-wrap items-end gap-2">
                  <Input
                    id="model-name"
                    placeholder="e.g. llama3.2"
                    {...register("name", { required: true })}
                  />
                  <Button type="submit" disabled={pulling}>
                    {pulling ? <Spinner /> : "Pull new model"}
                  </Button>
                </div>
                <FieldError errors={[pullError]} />
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      {loading ? (
        <LoadingState label="Loading models…" />
      ) : error ? (
        <ErrorState title="Could not load models" error={error} />
      ) : models.length === 0 ? (
        <EmptyState
          title="No models available"
          description="Pull a model above to make it available for your queued tasks."
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col gap-2">
            {models.map((model) =>
              model.name ? (
                <ModelCard
                  key={model.name}
                  name={model.name}
                  description={model.description}
                  size={model.size as bigint | null}
                  pulled={model.pulled}
                  capabilities={model.capabilities}
                />
              ) : null,
            )}
          </CardContent>
        </Card>
      )}
    </PageContainer>
  );
}
