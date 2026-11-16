"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#components/ui/card";
import { FileDropZone } from "./file-drop-zone";
import { FileTaskRunnerForm } from "./file-task-runner-form";
import type { FileEntry } from "./types";
import { useFileTaskRunner } from "./use-file-task-runner";

interface FileTaskRunnerProps {
  parentId: number | null;
  parentLabel: string;
  folderIds: number[];
  onUploaded: (entries: FileEntry[]) => void | Promise<void>;
}

/**
 * Bottom-of-page runner: dropping files uploads them, then starts a queued
 * task whose initial toolState contains the uploaded files (and the selected
 * folder, when one is active).
 */
export function FileTaskRunner({
  parentId,
  parentLabel,
  folderIds,
  onUploaded,
}: FileTaskRunnerProps) {
  const runner = useFileTaskRunner({ parentId, folderIds, onUploaded });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Run a task with files</CardTitle>
        <CardDescription>
          Drop files here to upload them and start a run with{" "}
          <code className="font-mono text-xs">files</code> in the first step's
          toolState. Files upload to {parentLabel}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,1.4fr)]">
        <FileTaskRunnerForm
          tasks={runner.tasks}
          tasksLoading={runner.tasksLoading}
          effectiveTaskId={runner.effectiveTaskId}
          defaultId={runner.defaultId}
          stateText={runner.stateText}
          busy={runner.busy}
          onTaskChange={runner.setSelectedTaskId}
          onStateTextChange={runner.setStateText}
          onFiles={(files) => {
            void runner.startRun(files);
          }}
        />

        <FileDropZone
          busy={runner.busy}
          onFiles={(files) => {
            void runner.startRun(files);
          }}
          onDirectory={runner.rejectDirectory}
        />

        {runner.error ? (
          <p className="text-sm text-destructive lg:col-span-2" role="alert">
            {runner.error instanceof Error
              ? runner.error.message
              : String(runner.error)}
          </p>
        ) : null}

        {runner.startedRunId ? (
          <p className="text-sm lg:col-span-2">
            Run started.{" "}
            <a className="underline underline-offset-4" href="/">
              Open the task queue
            </a>
            .
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
