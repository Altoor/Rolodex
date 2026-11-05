"use client";

import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { Field, FieldError, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "#components/ui/item";
import { Separator } from "#components/ui/separator";
import { Spinner } from "#components/ui/spinner";
import { sizeOfBytes } from "#lib/sizeOfBytes";
import { useMutation, useSubscription } from "@apollo/client/react";
import { UPDATE_MODEL_DESCRIPTION } from "@repo/queries/model/model-mutations";
import { PULL_MODEL } from "@repo/queries/model/model-subscriptions";
import { Check, Download, Pencil, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";
import { SubmitHandler, useForm } from "react-hook-form";

interface ModelCardProps {
  name: string;
  description: string | null;
  size: bigint | null;
  pulled: boolean | null;
  capabilities: string[] | null;
}

type Inputs = {
  description: string;
};

export default function ModelCard({
  name,
  description,
  size,
  pulled,
  capabilities,
}: ModelCardProps) {
  const [pullRequested, setPullRequested] = useState(false);
  const [showRefresh, setShowRefresh] = useState(false);
  const [showDescriptionField, setShowDescriptionField] = useState(false);
  const [updateModelDescription, { error: updateError }] = useMutation(
    UPDATE_MODEL_DESCRIPTION,
  );

  const {
    data,
    error: pullError,
    loading,
  } = useSubscription(PULL_MODEL, {
    variables: { name },
    skip: !pullRequested,
    onComplete: () => setPullRequested(false),
  });

  const { register, handleSubmit, reset } = useForm<Inputs>({
    defaultValues: { description: description ?? "" },
  });

  useEffect(() => {
    reset({ description: description ?? "" });
  }, [description, reset]);

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    await updateModelDescription({
      variables: { name, description: inputs.description },
    });

    setShowDescriptionField(false);
  };

  const status = data?.installModel?.status;
  const pulling = pullRequested && (loading || status === "pulling");
  const pullFailed = Boolean(pullError) || status === "error";
  const pullCompleted = pulled || status === "success";
  const error = pullError ?? updateError;

  return (
    <div>
      <Item>
        <ItemContent>
          <ItemTitle className="line-clamp-1">
            {name}
            {status ? (
              <span className="text-muted-foreground"> — {status}</span>
            ) : null}
          </ItemTitle>
          {pullCompleted && status !== "pulling" ? (
            <ItemDescription>
              {size ? `size: ${sizeOfBytes(size, 1)}` : null}
            </ItemDescription>
          ) : (
            <ItemDescription>
              {data?.installModel?.completed && data?.installModel?.total
                ? `getting: ${sizeOfBytes(
                    data.installModel.completed as bigint,
                    1,
                  )} of ${sizeOfBytes(data.installModel.total as bigint, 1)}`
                : null}
            </ItemDescription>
          )}
        </ItemContent>
        <ItemActions
          onMouseEnter={() => setShowRefresh(true)}
          onMouseLeave={() => setShowRefresh(false)}
        >
          <Button
            type="button"
            title={pulled ? "Re-pull model" : "Pull model"}
            aria-label={pulled ? "Re-pull model" : "Pull model"}
            disabled={pulling}
            onClick={() => setPullRequested(true)}
          >
            {pulling ? (
              <Spinner />
            ) : pullFailed ? (
              <RotateCcw />
            ) : pullCompleted ? (
              showRefresh ? (
                <RotateCcw />
              ) : (
                <Check />
              )
            ) : (
              <Download />
            )}
          </Button>
        </ItemActions>
        <ItemActions>
          <Button
            type="button"
            onClick={() => setShowDescriptionField(!showDescriptionField)}
            variant="ghost"
            size="icon-sm"
            title={
              showDescriptionField ? "Close description" : "Edit description"
            }
            aria-label={
              showDescriptionField ? "Close description" : "Edit description"
            }
          >
            {showDescriptionField ? <X /> : <Pencil />}
          </Button>
        </ItemActions>
      </Item>
      <div className="flex flex-col gap-3 p-3">
        {showDescriptionField ? (
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex flex-col gap-3"
          >
            <Field>
              <FieldLabel htmlFor={`model-${name}-description`}>
                Description
              </FieldLabel>
              <Input
                id={`model-${name}-description`}
                {...register("description")}
              />
            </Field>
            <Field>
              <FieldError errors={error ? [error] : []} />
              <Button type="submit" className="w-fit">
                Update description
              </Button>
            </Field>
          </form>
        ) : (
          <ItemDescription>
            {error ? error.message : description || "No description yet."}
          </ItemDescription>
        )}
        {capabilities ? (
          <div className="flex w-full flex-wrap justify-start gap-2">
            {capabilities.map((capability) => (
              <Badge key={`${name}-${capability}`} variant="secondary">
                {capability}
              </Badge>
            ))}
          </div>
        ) : null}

        <Separator className="mt-2" />
      </div>
    </div>
  );
}
