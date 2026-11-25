import { useLazyQuery, useMutation } from "@apollo/client/react";
import { EXPORT_TASKS, IMPORT_TASKS } from "@repo/queries/tasks/task-transfer";
import { TASKS } from "@repo/queries/tasks/task-queries";
import type { XYPosition } from "@xyflow/react";
import { useCallback, useRef, useState } from "react";
import { downloadTasksFile, parseTasksFile } from "../services/taskTransfer";

interface ImportedTasksResult {
  tasksCreated?: number;
  decisionsCreated?: number;
  taskIds?: number[];
  warnings?: string[];
}

interface UseTaskTransferArgs {
  onTasksImported?: (taskIds: number[], position?: XYPosition) => void;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readSystemClipboard(): Promise<string | null> {
  if (typeof navigator === "undefined" || !navigator.clipboard) return null;

  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

/** Copies, exports and pastes tasks through the existing import/export API. */
export function useTaskTransfer({ onTasksImported }: UseTaskTransferArgs) {
  const memoryClipboard = useRef<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [exportTasks, { loading: exporting }] = useLazyQuery(EXPORT_TASKS, {
    fetchPolicy: "network-only",
  });
  const [importTasks, { loading: importing }] = useMutation(IMPORT_TASKS, {
    refetchQueries: [TASKS],
  });

  const fetchExport = useCallback(
    async (taskIds?: number[]) => {
      const { data } = await exportTasks({ variables: { taskIds } });
      if (data?.exportTasks == null) {
        throw new Error("The server returned no export data");
      }
      return data.exportTasks;
    },
    [exportTasks],
  );

  const copyTasks = useCallback(
    async (taskIds: number[]) => {
      setError(null);
      setNotice(null);

      try {
        const exported = await fetchExport(taskIds);
        const text = JSON.stringify(exported);
        memoryClipboard.current = text;

        let copiedToSystem = false;
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          try {
            await navigator.clipboard.writeText(text);
            copiedToSystem = true;
          } catch {
            // The in-memory clipboard still works inside this tab.
          }
        }

        setNotice(
          taskIds.length === 1
            ? copiedToSystem
              ? "Task copied."
              : "Task copied for pasting in this tab."
            : copiedToSystem
              ? `${taskIds.length} tasks copied.`
              : `${taskIds.length} tasks copied for pasting in this tab.`,
        );
      } catch (err) {
        setError(messageFrom(err));
      }
    },
    [fetchExport],
  );

  const exportTaskFile = useCallback(
    async (taskIds?: number[]) => {
      setError(null);
      setNotice(null);

      try {
        const exported = await fetchExport(taskIds);
        const suffix =
          taskIds == null
            ? ""
            : taskIds.length === 1
              ? "-task"
              : "-selection";
        downloadTasksFile(
          exported,
          `rolodex-tasks${suffix}-${new Date().toISOString().slice(0, 10)}.json`,
        );
        setNotice(
          taskIds == null
            ? "Tasks exported."
            : taskIds.length === 1
              ? "Task exported."
              : `${taskIds.length} tasks exported.`,
        );
      } catch (err) {
        setError(messageFrom(err));
      }
    },
    [fetchExport],
  );

  const pasteTasks = useCallback(
    async (position?: XYPosition) => {
      setError(null);
      setNotice(null);

      try {
        const systemText = await readSystemClipboard();
        const candidates = [systemText, memoryClipboard.current].filter(
          (candidate): candidate is string => candidate != null && candidate !== "",
        );
        const text =
          candidates.find((candidate) => parseTasksFile(candidate) != null) ??
          candidates[0];

        if (!text) {
          setError("There is nothing to paste.");
          return;
        }

        const parsed = parseTasksFile(text);
        if (!parsed) {
          setError("The clipboard does not contain Rolodex tasks.");
          return;
        }

        const { data } = await importTasks({
          variables: { data: parsed, reuseExisting: true },
        });
        const result = (data?.importTasks ?? null) as ImportedTasksResult | null;
        const taskIds = result?.taskIds ?? [];

        if (taskIds.length === 0) {
          throw new Error("The server returned no pasted tasks");
        }

        onTasksImported?.(taskIds, position);
        setNotice(
          taskIds.length === 1
            ? "Task pasted."
            : `${taskIds.length} tasks pasted.`,
        );
      } catch (err) {
        setError(messageFrom(err));
      }
    },
    [importTasks, onTasksImported],
  );

  return {
    copyTasks,
    exportTaskFile,
    pasteTasks,
    exporting,
    importing,
    notice,
    error,
  };
}
