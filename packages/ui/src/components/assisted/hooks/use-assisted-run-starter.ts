"use client";

import { useMutation } from "@apollo/client/react";
import { useCallback, useState } from "react";
import type { AssistedRun } from "../types";
import { START_ASSISTED_RUN } from "./assisted-documents";

export interface StartAssistedRunVariables {
  taskId?: number | null;
  taskSnapshot?: Record<string, unknown> | null;
  state: string;
  fileIds?: number[];
  folderIds?: number[];
}

/**
 * Starts assisted runs and remembers their ids so the run list can show them
 * immediately, before the active-run query catches up.
 */
export function useAssistedRunStarter() {
  const [startMutation] = useMutation(START_ASSISTED_RUN);
  const [runIds, setRunIds] = useState<string[]>([]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (input: StartAssistedRunVariables) => {
      setStarting(true);
      setError(null);
      try {
        const { data } = await startMutation({
          variables: { input },
        });
        const run = (data as { startAssistedRun?: AssistedRun } | undefined)
          ?.startAssistedRun;
        if (run) {
          setRunIds((previous) =>
            previous.includes(run.id) ? previous : [...previous, run.id],
          );
        }
        return run ?? null;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setStarting(false);
      }
    },
    [startMutation],
  );

  return { start, runIds, starting, error };
}
