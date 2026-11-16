"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { CREATE_QUEUED_TASK } from "@repo/queries/tasks/task-mutations";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { useAuth } from "../auth/auth-provider";
import { FileUploadError, useFileActions } from "./file-actions";
import type { FileEntry } from "./types";

interface UseFileTaskRunnerOptions {
  parentId: number | null;
  folderIds: number[];
  onUploaded: (entries: FileEntry[]) => void | Promise<void>;
}

export function useFileTaskRunner({
  parentId,
  folderIds,
  onUploaded,
}: UseFileTaskRunnerOptions) {
  const { user } = useAuth();
  const { data: tasksData, loading: tasksLoading } = useQuery(TASKS);
  const [createQueuedTask] = useMutation(CREATE_QUEUED_TASK);
  const { uploadFiles } = useFileActions();

  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [stateText, setStateText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [startedRunId, setStartedRunId] = useState<string | null>(null);

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
    }
  };

  const rejectDirectory = () => {
    setError(
      new Error("Folder upload is not supported yet. Drop files instead."),
    );
  };

  return {
    tasks,
    tasksLoading,
    defaultId,
    effectiveTaskId,
    selectedTaskId,
    setSelectedTaskId,
    stateText,
    setStateText,
    busy,
    error,
    startedRunId,
    startRun,
    rejectDirectory,
  };
}
