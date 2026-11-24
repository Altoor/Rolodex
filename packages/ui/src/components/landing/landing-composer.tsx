"use client";

import { Controller } from "react-hook-form";
import { Button } from "#components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#components/ui/card";
import { ErrorState } from "#components/feedback/error-state";
import { Field, FieldLabel } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { StateComposer } from "./state-composer";
import type { LandingComposerProps } from "./landing-model";

/** The landing-page run composer. A starting task is always explicit. */
export function LandingComposer({
  tasks,
  autoEnabled,
  control,
  submit,
  onKeyDown,
  attachments,
  recording,
  isSubmitting,
  attachError,
  submitError,
  addFiles,
  removeAttachment,
  rejectDirectory,
  toggleRecording,
  children,
}: LandingComposerProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>What do you want to do today?</CardTitle>
        <CardDescription>
          {autoEnabled
            ? "Pick a starting task and describe the situation. Each step pauses for review."
            : "Pick a starting task, describe the situation, and hit enter."}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-32">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <Field>
            <FieldLabel htmlFor="landing-task">Starting task</FieldLabel>
            <Controller
              name="taskId"
              control={control}
              rules={{ required: "Choose a starting task" }}
              render={({ field }) => (
                <select
                  id="landing-task"
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={field.value}
                  disabled={isSubmitting || tasks.length === 0}
                  onChange={(event) => field.onChange(event.target.value)}
                >
                  {tasks.length === 0 ? (
                    <option value="">No tasks yet</option>
                  ) : null}
                  {tasks.map((task) => (
                    <option key={task.id} value={String(task.id)}>
                      {task.name}
                    </option>
                  ))}
                </select>
              )}
            />
          </Field>
          <Controller
            name="state"
            control={control}
            rules={{
              validate: (value) =>
                value.trim().length > 0 ||
                attachments.length > 0 ||
                "Describe the situation or attach a file.",
            }}
            render={({ field }) => (
              <StateComposer
                value={field.value}
                onChange={field.onChange}
                onKeyDown={onKeyDown}
                disabled={isSubmitting}
                attachments={attachments}
                recording={recording}
                onAddFiles={addFiles}
                onRemoveAttachment={removeAttachment}
                onDirectoryRejected={rejectDirectory}
                onToggleRecording={toggleRecording}
              />
            )}
          />
          {attachError ? (
            <ErrorState title="Could not add files" error={attachError} />
          ) : null}
          {submitError ? (
            <ErrorState title="Could not start a run" error={submitError} />
          ) : null}
          <Button
            type="submit"
            disabled={isSubmitting || recording || tasks.length === 0}
          >
            {isSubmitting ? <Spinner /> : "Submit"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        {children}
      </CardFooter>
    </Card>
  );
}
