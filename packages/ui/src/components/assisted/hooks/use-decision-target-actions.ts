"use client";

import { useMutation } from "@apollo/client/react";
import { useCallback } from "react";
import type { NextTaskDraft } from "../types";
import {
  CREATE_DECISION_TARGET_TASK,
  DRAFT_DECISION_TARGET_TASK,
  WIRE_DECISION_TARGET_TASK,
} from "./assisted-documents";

interface DecisionTargetActionOptions {
  refresh: () => void;
  setBusy: (value: string | null) => void;
  setActionError: (value: string | null) => void;
}

/** Draft, wire, or create the next task for an unwired decision option. */
export function useDecisionTargetActions({
  refresh,
  setBusy,
  setActionError,
}: DecisionTargetActionOptions) {
  const [draftTargetMutation] = useMutation(DRAFT_DECISION_TARGET_TASK);
  const [wireTargetMutation] = useMutation(WIRE_DECISION_TARGET_TASK);
  const [createTargetMutation] = useMutation(CREATE_DECISION_TARGET_TASK);

  const draftDecisionTarget = useCallback(
    async (
      attemptId: number,
      feedback?: string,
      draft?: NextTaskDraft,
    ): Promise<NextTaskDraft | null> => {
      setBusy(`target-draft:${attemptId}`);
      setActionError(null);
      try {
        const { data } = await draftTargetMutation({
          variables: { attemptId, feedback, draft },
        });
        const next = (
          data as { draftDecisionTargetTask?: NextTaskDraft } | undefined
        )?.draftDecisionTargetTask;
        return next ?? null;
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [draftTargetMutation, setActionError, setBusy],
  );

  const wireDecisionTarget = useCallback(
    async (attemptId: number, resultId: number, targetTaskId: number) => {
      setBusy(`target-wire:${attemptId}`);
      setActionError(null);
      try {
        await wireTargetMutation({
          variables: { attemptId, resultId, targetTaskId },
        });
        refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [refresh, setActionError, setBusy, wireTargetMutation],
  );

  const createDecisionTarget = useCallback(
    async (attemptId: number, resultId: number, draft: NextTaskDraft) => {
      setBusy(`target-create:${attemptId}`);
      setActionError(null);
      try {
        await createTargetMutation({
          variables: { attemptId, resultId, draft },
        });
        refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [createTargetMutation, refresh, setActionError, setBusy],
  );

  return { draftDecisionTarget, wireDecisionTarget, createDecisionTarget };
}
