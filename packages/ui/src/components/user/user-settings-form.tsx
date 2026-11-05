"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { INSTALLED_MODELS } from "@repo/queries/model/model-queries";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { UPDATE_USER_SETTINGS } from "@repo/queries/user/user-mutations";
import { ME } from "@repo/queries/user/users-queries";
import { ErrorState } from "#components/feedback/error-state";
import { Button } from "#components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#components/ui/card";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#components/ui/select";
import { Spinner } from "#components/ui/spinner";

const NONE = "__none__";

interface UserSettingsFormProps {
  initialDefaultTaskId: number | null;
  initialDefaultModelName: string | null;
  onSaved?: () => void;
  onDirty?: () => void;
}

/**
 * Parent should pass a `key` built from the saved settings so this form
 * remounts with fresh state after settings change.
 */
export function UserSettingsForm({
  initialDefaultTaskId,
  initialDefaultModelName,
  onSaved,
  onDirty,
}: UserSettingsFormProps) {
  const {
    data: tasksData,
    loading: tasksLoading,
    error: tasksError,
  } = useQuery(TASKS);
  const {
    data: modelsData,
    loading: modelsLoading,
    error: modelsError,
  } = useQuery(INSTALLED_MODELS);
  const [updateSettings, { loading: saving, error: saveError }] = useMutation(
    UPDATE_USER_SETTINGS,
    { refetchQueries: [ME] },
  );

  const [defaultTaskId, setDefaultTaskId] = useState(
    initialDefaultTaskId?.toString() ?? NONE,
  );
  const [defaultModelName, setDefaultModelName] = useState(
    initialDefaultModelName ?? NONE,
  );

  const tasks = tasksData?.tasks ?? [];
  const models = modelsData?.installedModels ?? [];

  const save = async () => {
    const { error } = await updateSettings({
      variables: {
        defaultTaskId: defaultTaskId === NONE ? null : Number(defaultTaskId),
        defaultModelName: defaultModelName === NONE ? null : defaultModelName,
      },
    });

    if (!error) onSaved?.();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Queue defaults</CardTitle>
        <CardDescription>
          These settings apply only to your account.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Field>
          <FieldLabel htmlFor="default-task">Starting task</FieldLabel>
          <Select
            value={defaultTaskId}
            onValueChange={(value) => {
              setDefaultTaskId(value ?? NONE);
              onDirty?.();
            }}
            disabled={tasksLoading || saving}
          >
            <SelectTrigger id="default-task" className="w-full">
              <SelectValue placeholder="Choose a task" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>
                  No default — choose each run
                </SelectItem>
                {tasks.map((task) => (
                  <SelectItem key={task.id} value={String(task.id)}>
                    {task.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            Preselected when you open the main page or queue a run without a
            task.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="default-model">Model</FieldLabel>
          <Select
            value={defaultModelName}
            onValueChange={(value) => {
              setDefaultModelName(value ?? NONE);
              onDirty?.();
            }}
            disabled={modelsLoading || saving}
          >
            <SelectTrigger id="default-model" className="w-full">
              <SelectValue placeholder="Use the backend default" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={NONE}>Use the backend default</SelectItem>
                {models.map((model) => (
                  <SelectItem key={model.name} value={model.name}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            The model used to execute your queued tasks.
          </FieldDescription>
        </Field>

        {tasksError ? (
          <ErrorState title="Could not load tasks" error={tasksError} />
        ) : null}
        {modelsError ? (
          <ErrorState title="Could not load models" error={modelsError} />
        ) : null}
        {saveError ? (
          <ErrorState title="Could not save settings" error={saveError} />
        ) : null}

        {tasks.length === 0 && !tasksLoading ? (
          <p className="text-sm text-muted-foreground">
            No tasks exist yet. Create one on the{" "}
            <a className="underline underline-offset-4" href="/task-queue">
              task queue page
            </a>{" "}
            first.
          </p>
        ) : null}

        {models.length === 0 && !modelsLoading ? (
          <p className="text-sm text-muted-foreground">
            No models are installed yet. Pull one on the{" "}
            <a className="underline underline-offset-4" href="/models">
              models page
            </a>{" "}
            first.
          </p>
        ) : null}
      </CardContent>
      <CardFooter>
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Spinner /> : null}
          Save changes
        </Button>
      </CardFooter>
    </Card>
  );
}
