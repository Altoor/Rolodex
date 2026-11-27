"use client";

import { useState } from "react";
import { Button } from "#components/ui/button";
import { Field, FieldLabel } from "#components/ui/field";
import { Input } from "#components/ui/input";
import { Spinner } from "#components/ui/spinner";
import { useApiOrigin } from "#lib/apiOriginContext";
import { invokeUrl, type ApiEndpoint, type TaskOption } from "../lib/api-utils";

export interface EndpointFormValues {
  name: string;
  description: string;
  taskId: number | null;
  stateField: string;
  slug: string;
}

interface ApiEndpointFormProps {
  endpoint: ApiEndpoint;
  tasks: TaskOption[];
  busy: boolean;
  onSave: (values: EndpointFormValues) => void;
  onCancel: () => void;
}

/** Edit form for one endpoint. Values are local until saved. */
export function ApiEndpointForm({
  endpoint,
  tasks,
  busy,
  onSave,
  onCancel,
}: ApiEndpointFormProps) {
  const [name, setName] = useState(endpoint.name ?? "");
  const [slug, setSlug] = useState(endpoint.slug ?? "");
  const [taskId, setTaskId] = useState(String(endpoint.taskId ?? ""));
  const [description, setDescription] = useState(endpoint.description ?? "");
  const [stateField, setStateField] = useState(endpoint.stateField ?? "");
  const apiOrigin = useApiOrigin();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!endpoint.id) return;
        onSave({
          name: name.trim(),
          description: description.trim(),
          taskId: taskId ? Number(taskId) : null,
          stateField: stateField.trim(),
          slug: slug.trim(),
        });
      }}
      className="flex flex-col gap-3 border-t pt-3"
    >
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
        <FieldLabel htmlFor={`api-slug-${endpoint.id}`}>URL slug</FieldLabel>
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
          {invokeUrl(apiOrigin, slug.trim() || null)}
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
          {busy ? <Spinner /> : null}
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
