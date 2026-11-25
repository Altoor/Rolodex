"use client";

import { useLazyQuery, useMutation } from "@apollo/client/react";
import { EXPORT_TASKS, IMPORT_TASKS } from "@repo/queries/tasks/task-transfer";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { Button } from "#components/ui/button";
import { Spinner } from "#components/ui/spinner";
import { Download, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { downloadTasksFile, parseTasksFile } from "../services/taskTransfer";

interface ImportResult {
  tasksCreated?: number;
  decisionsCreated?: number;
  taskIds?: number[];
  warnings?: string[];
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Downloads all tasks as a file, or imports a previously exported file. */
const TaskTransfer = () => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [exportTasks, { loading: exporting }] = useLazyQuery(EXPORT_TASKS, {
    fetchPolicy: "network-only",
  });
  const [importTasks, { loading: importing }] = useMutation(IMPORT_TASKS, {
    refetchQueries: [TASKS],
  });

  const download = async () => {
    setError(null);
    setNotice(null);

    try {
      const { data } = await exportTasks();
      if (data?.exportTasks == null) {
        throw new Error("The server returned no export data");
      }

      downloadTasksFile(data.exportTasks);
      setNotice("Tasks exported.");
    } catch (err) {
      setError(messageFrom(err));
    }
  };

  const importFile = async (file: File) => {
    setError(null);
    setNotice(null);

    try {
      const text = await file.text();
      const parsed = parseTasksFile(text);

      if (!parsed) {
        throw new Error("This is not a Rolodex tasks file");
      }

      const { data } = await importTasks({ variables: { data: parsed } });
      const result = (data?.importTasks ?? null) as ImportResult | null;

      if (result == null) {
        throw new Error("The server returned no import result");
      }

      const warnings = result.warnings ?? [];
      setNotice(
        `Imported ${result.tasksCreated ?? 0} task(s) and ${
          result.decisionsCreated ?? 0
        } decision(s).${
          warnings.length > 0 ? ` ${warnings.length} warning(s).` : ""
        }`,
      );
      if (warnings.length > 0) setError(warnings.join(" "));
    } catch (err) {
      setError(messageFrom(err));
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={exporting}
        onClick={() => void download()}
      >
        {exporting ? <Spinner /> : <Upload />}
        Export
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={importing}
        onClick={() => fileInput.current?.click()}
      >
        {importing ? <Spinner /> : <Download />}
        Import
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void importFile(file);
        }}
      />
      {error ? (
        <span className="max-w-100 text-sm text-destructive">{error}</span>
      ) : notice ? (
        <span className="text-sm text-muted-foreground">{notice}</span>
      ) : null}
    </div>
  );
};

export default TaskTransfer;
