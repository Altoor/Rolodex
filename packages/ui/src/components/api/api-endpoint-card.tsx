"use client";

import { useMutation } from "@apollo/client/react";
import { useState } from "react";
import {
  API_ENDPOINTS,
  DELETE_API_ENDPOINT,
  ROTATE_API_ENDPOINT_KEY,
  UPDATE_API_ENDPOINT,
} from "@repo/queries/api/api-queries";
import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#components/ui/card";
import { ErrorState } from "#components/feedback/error-state";
import { Field, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Spinner } from "#components/ui/spinner";
import { ApiRequestList } from "./api-request-list";
import {
  copyText,
  invokeUrl,
  statusUrl,
  websocketUrl,
  type ApiEndpoint,
} from "./api-utils";

interface TaskOption {
  id: number | null;
  name: string | null;
}

interface ApiEndpointCardProps {
  endpoint: ApiEndpoint;
  tasks: TaskOption[];
  onKey: (input: { apiKey: string; endpointName: string }) => void;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <code className="min-w-0 flex-1 overflow-x-auto rounded bg-muted px-2 py-1 font-mono text-[11px]">
        {value}
      </code>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => {
          void copyText(value).then(() => setCopied(true));
        }}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

export function ApiEndpointCard({
  endpoint,
  tasks,
  onKey,
}: ApiEndpointCardProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(endpoint.name ?? "");
  const [slug, setSlug] = useState(endpoint.slug ?? "");
  const [taskId, setTaskId] = useState(String(endpoint.taskId ?? ""));
  const [description, setDescription] = useState(endpoint.description ?? "");
  const [stateField, setStateField] = useState(endpoint.stateField ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [update, updateState] = useMutation(UPDATE_API_ENDPOINT, {
    refetchQueries: [API_ENDPOINTS],
  });
  const [rotate, rotateState] = useMutation(ROTATE_API_ENDPOINT_KEY, {
    refetchQueries: [API_ENDPOINTS],
  });
  const [remove, removeState] = useMutation(DELETE_API_ENDPOINT, {
    refetchQueries: [API_ENDPOINTS],
  });

  const busy =
    updateState.loading || rotateState.loading || removeState.loading;
  const error = updateState.error ?? rotateState.error ?? removeState.error;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!endpoint.id) return;

    await update({
      variables: {
        id: endpoint.id,
        name: name.trim(),
        description: description.trim(),
        taskId: taskId ? Number(taskId) : null,
        stateField: stateField.trim(),
        slug: slug.trim(),
      },
    });
    setEditing(false);
  };

  const rotateKey = async () => {
    if (!endpoint.id) return;
    const result = await rotate({ variables: { id: endpoint.id } });
    const payload = result.data?.rotateApiEndpointKey;
    if (!payload) return;

    onKey({
      apiKey: payload.apiKey ?? "",
      endpointName: payload.endpoint?.name ?? endpoint.name ?? "API endpoint",
    });
  };

  const deleteEndpoint = async () => {
    if (!endpoint.id) return;
    await remove({ variables: { id: endpoint.id } });
  };

  const enabled = endpoint.enabled ?? false;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{endpoint.name}</CardTitle>
          <Badge variant={enabled ? "default" : "outline"}>
            {enabled ? "Enabled" : "Disabled"}
          </Badge>
          {endpoint.task?.name ? (
            <Badge variant="secondary">{endpoint.task.name}</Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">
          Key {endpoint.keyPrefix}…{endpoint.keyLastFour}
          {endpoint.description ? ` · ${endpoint.description}` : ""}
        </p>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CopyRow label="Invoke" value={invokeUrl(endpoint.slug)} />
          <CopyRow label="Status" value={statusUrl(endpoint.slug)} />
          <CopyRow label="WebSocket" value={websocketUrl(endpoint.slug)} />
        </div>

        <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed">
          {`# JSON body
curl -X POST '${invokeUrl(endpoint.slug)}' \\
  -H 'Authorization: Bearer <api-key>' \\
  -H 'Content-Type: application/json' \\
  -d '{"state":"Hello from the API"}'

# Attach one or more files
curl -X POST '${invokeUrl(endpoint.slug)}' \\
  -H 'Authorization: Bearer <api-key>' \\
  -F 'state=Hello from the API' \\
  -F 'files=@./document.pdf' \\
  -F 'files=@./photo.jpg'`}
        </pre>

        <ApiRequestList endpointId={endpoint.id ?? ""} />

        {editing ? (
          <form onSubmit={save} className="flex flex-col gap-3 border-t pt-3">
            <Field>
              <FieldLabel htmlFor={`api-name-${endpoint.id}`}>Name</FieldLabel>
              <Input
                id={`api-name-${endpoint.id}`}
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`api-slug-${endpoint.id}`}>
                URL slug
              </FieldLabel>
              <Input
                id={`api-slug-${endpoint.id}`}
                value={slug}
                onChange={(event) => setSlug(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                Changing this changes the URL clients call.
              </p>
              <p className="font-mono text-[11px] break-all text-muted-foreground">
                {invokeUrl(slug.trim() || null)}
              </p>
            </Field>
            <Field>
              <FieldLabel htmlFor={`api-task-${endpoint.id}`}>Task</FieldLabel>
              <select
                id={`api-task-${endpoint.id}`}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={taskId}
                onChange={(event) => setTaskId(event.target.value)}
              >
                {tasks.map((task) => (
                  <option key={task.id} value={String(task.id)}>
                    {task.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field>
              <FieldLabel htmlFor={`api-description-${endpoint.id}`}>
                Description
              </FieldLabel>
              <Input
                id={`api-description-${endpoint.id}`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`api-state-field-${endpoint.id}`}>
                State field
              </FieldLabel>
              <Input
                id={`api-state-field-${endpoint.id}`}
                value={stateField}
                onChange={(event) => setStateField(event.target.value)}
                placeholder="Leave empty for the whole body"
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={busy}>
                {updateState.loading ? <Spinner /> : null}
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        ) : null}

        {error ? (
          <ErrorState title="Endpoint action failed" error={error} />
        ) : null}

        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setEditing((current) => !current)}
          >
            {editing ? "Close editor" : "Edit"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !endpoint.id}
            onClick={() => {
              if (!endpoint.id) return;
              void update({
                variables: { id: endpoint.id, enabled: !enabled },
              });
            }}
          >
            {enabled ? "Disable" : "Enable"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !endpoint.id}
            onClick={() => void rotateKey()}
          >
            {rotateState.loading ? <Spinner /> : null}
            Rotate key
          </Button>
          {confirmDelete ? (
            <>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => void deleteEndpoint()}
              >
                Confirm delete
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
