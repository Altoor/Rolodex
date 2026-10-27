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
import { useState } from "react";
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
  const [pullStatus, setPullStatus] = useState(false);
  const [showRefresh, setShowRefresh] = useState(false);
  const [showDescriptionField, setShowDescriptionField] = useState(false);
  const [updateModelDescription] = useMutation(UPDATE_MODEL_DESCRIPTION);

  const { data, error, loading } = useSubscription(PULL_MODEL, {
    variables: { name: name },
    skip: !pullStatus,
  });

  const {
    register,
    handleSubmit,
    formState: { errors: formErrors },
    setValue,
  } = useForm<Inputs>();

  if (description) setValue("description", description);

  const onSubmit: SubmitHandler<Inputs> = async (inputs) => {
    await updateModelDescription({
      variables: { name: name, description: inputs.description },
    });

    setShowDescriptionField(false);
  };

  return (
    <div>
      <Item>
        <ItemContent>
          <ItemTitle className="line-clamp-1">
            {name}
            {data && (
              <>
                <span className="text-muted-foreground">
                  - {data.installModel?.status}
                </span>
              </>
            )}
          </ItemTitle>
          {data?.installModel?.status === "success" || pulled ? (
            <ItemDescription>
              {error
                ? error.message
                : size
                  ? "size: " + sizeOfBytes(size, 1)
                  : null}
            </ItemDescription>
          ) : (
            <ItemDescription>
              {error
                ? error.message
                : data?.installModel?.completed && data?.installModel?.total
                  ? "getting: " +
                    sizeOfBytes(data?.installModel?.completed as bigint, 1) +
                    " of " +
                    sizeOfBytes(data?.installModel?.total as bigint, 1)
                  : null}
            </ItemDescription>
          )}
        </ItemContent>
        {pulled ? (
          <>
            <ItemActions
              onMouseEnter={() => setShowRefresh(true)}
              onMouseLeave={() => setShowRefresh(false)}
            >
              <Button onClick={() => setPullStatus(true)}>
                {loading ? (
                  <Spinner />
                ) : showRefresh ? (
                  <RotateCcw />
                ) : (
                  <Check />
                )}
              </Button>
            </ItemActions>
          </>
        ) : (
          <ItemActions>
            <Button onClick={() => setPullStatus(true)}>
              {loading ? <Spinner /> : <Download />}
            </Button>
          </ItemActions>
        )}
        <ItemActions>
          <Button
            onClick={() => setShowDescriptionField(!showDescriptionField)}
            variant={"link"}
          >
            {showDescriptionField ? <X /> : <Pencil />}
          </Button>
        </ItemActions>
      </Item>
      <div className="p-3 gap-3">
        {showDescriptionField ? (
          <form onSubmit={handleSubmit(onSubmit)}>
            <Field>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <Input {...register("description")} />
            </Field>
            <Field>
              <FieldError errors={[error]}></FieldError>
              <Button type="submit">
                {loading ? <Spinner /> : "update description"}
              </Button>
            </Field>
          </form>
        ) : (
          <ItemDescription>
            {error ? error.message : description}
          </ItemDescription>
        )}
        {capabilities ? (
          <div className="flex w-full flex-wrap justify-start gap-2">
            {capabilities.map((capability) => (
              <Badge key={name + capability} variant="secondary">
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
