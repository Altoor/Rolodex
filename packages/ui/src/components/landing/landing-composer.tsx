"use client";

import { Button } from "#components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#components/ui/card";
import { Spinner } from "#components/ui/spinner";
import { ErrorState } from "#components/feedback/error-state";
import { Controller } from "react-hook-form";
import { StateComposer } from "./state-composer";
import { LandingTaskSelect } from "./landing-task-select";
import type { LandingComposerProps } from "./landing-model";

/**
 * The landing page's main card: pick a task, describe the situation, attach
 * files, and submit. The run list is passed in as the card footer.
 */
export function LandingComposer({
  tasks,
  autoEnabled,
  assistant,
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
            ? "Pick a starting task, or let the local model suggest one, then describe the situation."
            : "Pick a starting task, describe the situation, and hit enter."}
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-32">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <LandingTaskSelect
            control={control}
            tasks={tasks}
            autoEnabled={autoEnabled}
            disabled={isSubmitting}
          />
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
          <Button type="submit" disabled={isSubmitting || recording}>
            {isSubmitting ? <Spinner /> : "Submit"}
          </Button>
        </form>
        {assistant}
      </CardContent>
      <CardFooter className="flex-col items-stretch gap-3">
        {children}
      </CardFooter>
    </Card>
  );
}
