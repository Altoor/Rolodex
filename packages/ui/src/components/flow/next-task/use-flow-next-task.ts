"use client";

import { useMutation } from "@apollo/client/react";
import {
  CONFIRM_FLOW_START_DRAFT,
  DRAFT_FLOW_START_TASK,
  REFINE_FLOW_TASK_DRAFT,
} from "@repo/queries/flow/flow-mutations";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { useState } from "react";
import {
  toFlowTaskDraft,
  type FlowStartKind,
  type FlowTaskDraft,
} from "../flow-model";

export type NextTaskBusy = "draft" | "refine" | "create" | null;

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Drafts and creates the next task for a decision branch without starting a
 * run. The caller wires the returned task id into the decision slot.
 */
export function useFlowNextTask(contextState: string) {
  const [draft, setDraft] = useState<FlowTaskDraft | null>(null);
  const [busy, setBusy] = useState<NextTaskBusy>(null);
  const [error, setError] = useState<string | null>(null);

  const [draftMutation] = useMutation(DRAFT_FLOW_START_TASK);
  const [refineMutation] = useMutation(REFINE_FLOW_TASK_DRAFT);
  const [confirmMutation] = useMutation(CONFIRM_FLOW_START_DRAFT, {
    refetchQueries: [TASKS],
  });

  const draftTask = async (
    kind: FlowStartKind,
    prompt: string,
  ): Promise<boolean> => {
    if (busy) return false;

    setBusy("draft");
    setError(null);

    try {
      const { data } = await draftMutation({
        variables: {
          kind,
          state: contextState,
          prompt: prompt.trim() || null,
        },
      });
      const next = toFlowTaskDraft(data?.draftFlowStartTask);
      if (!next) throw new Error("The model returned no usable draft");
      setDraft(next);
      return true;
    } catch (err) {
      setError(messageFrom(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const refineDraft = async (prompt: string): Promise<boolean> => {
    if (!draft || !prompt.trim() || busy) return false;

    setBusy("refine");
    setError(null);

    try {
      const { data } = await refineMutation({
        variables: {
          draft: draft as unknown as Record<string, unknown>,
          state: contextState,
          prompt,
        },
      });
      const next = toFlowTaskDraft(data?.refineFlowTaskDraft);
      if (!next) throw new Error("The model returned no usable draft");
      setDraft(next);
      return true;
    } catch (err) {
      setError(messageFrom(err));
      return false;
    } finally {
      setBusy(null);
    }
  };

  const createTask = async (): Promise<number | null> => {
    if (!draft || busy) return null;

    setBusy("create");
    setError(null);

    try {
      const { data } = await confirmMutation({
        variables: {
          draft: draft as unknown as Record<string, unknown>,
          state: contextState,
          start: false,
        },
      });
      const taskId = data?.confirmFlowStartDraft?.taskId ?? null;
      if (taskId == null) throw new Error("Could not create the next task");
      return taskId;
    } catch (err) {
      setError(messageFrom(err));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const reset = () => {
    setDraft(null);
    setError(null);
  };

  return {
    draft,
    busy,
    error,
    draftTask,
    refineDraft,
    createTask,
    updateDraft: setDraft,
    reset,
  };
}
