"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { Play, Upload } from "lucide-react";
import { cn } from "cn";
import { CREATE_QUEUED_TASK } from "@repo/queries/tasks/task-mutations";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { useAuth } from "../auth/auth-provider";
import { FileUploadError, useFileActions } from "./file-actions";
import type { FileEntry } from "./types";
import { Button } from "#components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Textarea } from "#components/ui/textarea";

interface FileTaskRunnerProps {
  parentId: number | null;
  parentLabel: string;
  folderIds: number[];
  onUploaded: (entries: FileEntry[]) => void | Promise<void>;
}

function hasDirectory(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.items).some((item) => {
    const entry = item.webkitGetAsEntry?.();
    return entry?.isDirectory === true;
  });
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
  const { user } = useAuth();
  const { data: tasksData, loading: tasksLoading } = useQuery(TASKS);
  const [createQueuedTask] = useMutation(CREATE_QUEUED_TASK);
  const { uploadFiles } = useFileActions();

  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [stateText, setStateText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [startedRunId, setStartedRunId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tasks = useMemo(() => tasksData?.tasks ?? [], [tasksData]);
  const defaultTaskId = user?.settings?.defaultTaskId ?? null;

  // Prefer an explicit selection, then the account default. Unlike the landing
  // page we intentionally do not fall back to the first task, so a missing
  // default produces a clear inline error instead of silently running the
  // wrong flow.
  const defaultId =
    defaultTaskId != null &&
    tasks.some((task) => String(task.id) === String(defaultTaskId))
      ? String(defaultTaskId)
      : null;
  const effectiveTaskId =
    selectedTaskId && tasks.some((task) => String(task.id) === selectedTaskId)
      ? selectedTaskId
      : (defaultId ?? "");

  const startRun = async (files: File[]) => {
    if (files.length === 0 || busy) return;

    setError(null);
    setStartedRunId(null);

    if (!effectiveTaskId) {
      setError(
        new Error(
          "Select a task first, or set a default task in your account settings.",
        ),
      );
      return;
    }

    setBusy(true);

    try {
      const uploaded = await uploadFiles(files, parentId);
      await onUploaded(uploaded);

      const requestedState =
        stateText.trim() ||
        `Process ${files.length === 1 ? files[0]!.name : `${files.length} files`}`;
      const result = await createQueuedTask({
        variables: {
          taskId: Number(effectiveTaskId),
          state: requestedState,
          fileIds: uploaded.map((entry) => entry.id),
          folderIds,
        },
      });

      const runId = result.data?.createQueuedTask?.runId ?? null;
      setStartedRunId(runId ?? "started");
      setStateText("");
    } catch (err) {
      // Keep any files that landed before a partial upload failure visible.
      if (err instanceof FileUploadError) {
        await Promise.resolve(onUploaded(err.uploaded)).catch(() => undefined);
      }
      setError(err);
    } finally {
      setBusy(false);
      setDragging(false);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    if (busy) return;

    if (hasDirectory(event.dataTransfer)) {
      setError(
        new Error("Folder upload is not supported yet. Drop files instead."),
      );
      setDragging(false);
      return;
    }

    void startRun(Array.from(event.dataTransfer.files));
  };

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
        <div className="flex flex-col gap-3">
          <Field>
            <FieldLabel>Starting task</FieldLabel>
            <Select
              value={effectiveTaskId}
              onValueChange={(value) => setSelectedTaskId(value ?? "")}
              disabled={busy || tasksLoading || tasks.length === 0}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a task or use your default" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {tasks.map((task) => (
                    <SelectItem key={task.id} value={String(task.id)}>
                      {task.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              {defaultId
                ? "Your account default is selected automatically."
                : "No default task is set. Pick a task here before dropping files."}
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="file-task-state">
              Instruction (optional)
            </FieldLabel>
            <Textarea
              id="file-task-state"
              value={stateText}
              onChange={(event) => setStateText(event.target.value)}
              placeholder="For example: summarise each file and update its description."
              disabled={busy}
            />
            <FieldDescription>
              Leave empty to use the uploaded filenames as the run state.
            </FieldDescription>
          </Field>

          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            {busy ? <Spinner className="size-4" /> : <Play />}
            {busy ? "Uploading and starting…" : "Choose files and run"}
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              if (files.length > 0) void startRun(files);
            }}
          />
        </div>

        <div
          className={cn(
            "flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors",
            dragging && "border-primary bg-primary/5",
            busy && "opacity-60",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
            setDragging(true);
          }}
          onDragLeave={(event) => {
            if (
              event.relatedTarget instanceof Node &&
              event.currentTarget.contains(event.relatedTarget)
            ) {
              return;
            }
            setDragging(false);
          }}
          onDrop={handleDrop}
        >
          <Upload className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">
            {dragging ? "Drop to upload and run" : "Drop files here"}
          </p>
          <p className="text-xs text-muted-foreground">
            Folder upload is not supported yet. Multiple files are allowed.
          </p>
        </div>

        {error ? (
          <p className="text-sm text-destructive lg:col-span-2" role="alert">
            {error instanceof Error ? error.message : String(error)}
          </p>
        ) : null}

        {startedRunId ? (
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
