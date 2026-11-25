"use client";

import { useMutation } from "@apollo/client/react";
import { useState } from "react";
import {
  CREATE_API_ENDPOINT,
  API_ENDPOINTS,
} from "@repo/queries/api/api-queries";
import { Button } from "#components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#components/ui/card";
import { Field, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Spinner } from "#components/ui/spinner";
import { ErrorState } from "#components/feedback/error-state";
import { invokeUrl } from "./api-utils";

interface TaskOption {
  id: number | null;
  name: string | null;
}

interface ApiCreateFormProps {
  tasks: TaskOption[];
  onCreated: (input: { apiKey: string; endpointName: string }) => void;
}

export function ApiCreateForm({ tasks, onCreated }: ApiCreateFormProps) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [taskId, setTaskId] = useState("");
  const [description, setDescription] = useState("");
  const [stateField, setStateField] = useState("");

  const [create, { loading, error }] = useMutation(CREATE_API_ENDPOINT, {
    refetchQueries: [API_ENDPOINTS],
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();

    const result = await create({
      variables: {
        name: name.trim(),
        taskId: Number(taskId),
        description: description.trim() || null,
        stateField: stateField.trim() || null,
        slug: slug.trim() || null,
      },
    });

    const payload = result.data?.createApiEndpoint;
    const endpoint = payload?.endpoint;
    if (!payload || !endpoint) return;

    onCreated({
      apiKey: payload.apiKey ?? "",
      endpointName: endpoint.name ?? "API endpoint",
    });
    setName("");
    setSlug("");
    setTaskId("");
    setDescription("");
    setStateField("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>New API link</CardTitle>
        <CardDescription>
          Pick the task to queue, then share the generated URL and key. The key
          is only shown once.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="api-name">Name</FieldLabel>
            <Input
              id="api-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Recipe importer"
              required
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="api-slug">URL slug (optional)</FieldLabel>
            <Input
              id="api-slug"
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="test"
            />
            <p className="text-xs text-muted-foreground">
              The last part of the URL. Use lowercase letters, numbers, dashes,
              or underscores; leave empty for a random slug.
            </p>
            <p className="font-mono text-[11px] break-all text-muted-foreground">
              {invokeUrl(slug.trim() || null)}
            </p>
          </Field>

          <Field>
            <FieldLabel htmlFor="api-task">Task</FieldLabel>
            <select
              id="api-task"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={taskId}
              onChange={(event) => setTaskId(event.target.value)}
              required
            >
              <option value="">Choose a task</option>
              {tasks.map((task) => (
                <option key={task.id} value={String(task.id)}>
                  {task.name}
                </option>
              ))}
            </select>
          </Field>

          <Field>
            <FieldLabel htmlFor="api-description">Description</FieldLabel>
            <Input
              id="api-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this endpoint accepts"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="api-state-field">
              State field (optional)
            </FieldLabel>
            <Input
              id="api-state-field"
              value={stateField}
              onChange={(event) => setStateField(event.target.value)}
              placeholder="state"
            />
            <p className="text-xs text-muted-foreground">
              Use one request field as the task state. Leave empty to send the
              whole JSON body.
            </p>
          </Field>

          {error ? (
            <ErrorState title="Could not create the endpoint" error={error} />
          ) : null}

          <Button
            type="submit"
            disabled={loading || !name.trim() || !taskId}
          >
            {loading ? <Spinner /> : null}
            Create API link
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
