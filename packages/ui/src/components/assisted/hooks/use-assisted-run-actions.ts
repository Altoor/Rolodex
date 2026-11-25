"use client";

import { useMutation } from "@apollo/client/react";
import { useCallback, useMemo, useState } from "react";
import type { AssistedRun, RevisionProposal } from "../types";
import {
  ACCEPT_STEP_ATTEMPT,
  ADD_DECISION_OPTION,
  APPLY_STEP_REVISION,
  CANCEL_ASSISTED_RUN,
  EDIT_DECISION_WORDING,
  OPTIMIZE_DECISION,
  OVERRIDE_DECISION,
  REQUEST_STEP_REVISION,
  SAVE_USER_DECISION_OPTIONS,
} from "./assisted-documents";
import { useDecisionTargetActions } from "./use-decision-target-actions";

interface MutationData {
  [key: string]: AssistedRun | null;
}

/** Review mutations for one assisted run, with shared busy/error state. */
export function useAssistedRunActions(runId: string | null, refresh: () => void) {
  const [acceptMutation] = useMutation(ACCEPT_STEP_ATTEMPT);
  const [requestMutation] = useMutation(REQUEST_STEP_REVISION);
  const [applyMutation] = useMutation(APPLY_STEP_REVISION);
  const [overrideMutation] = useMutation(OVERRIDE_DECISION);
  const [optimizeMutation] = useMutation(OPTIMIZE_DECISION);
  const [editWordingMutation] = useMutation(EDIT_DECISION_WORDING);
  const [addOptionMutation] = useMutation(ADD_DECISION_OPTION);
  const [saveOptionsMutation] = useMutation(SAVE_USER_DECISION_OPTIONS);
  const [cancelMutation] = useMutation(CANCEL_ASSISTED_RUN);

  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<RevisionProposal | null>(null);

  const accept = useCallback(
    async (attemptId: number) => {
      setBusy(`accept:${attemptId}`);
      setActionError(null);
      try {
        await acceptMutation({ variables: { attemptId } });
        refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [acceptMutation, refresh],
  );

  const requestRevision = useCallback(
    async (attemptId: number, feedback: string) => {
      setBusy(`revise:${attemptId}`);
      setActionError(null);
      try {
        const result = await requestMutation({
          variables: { attemptId, feedback },
        });
        const next = (result.data as MutationData | undefined)
          ?.requestStepRevision;
        setProposal(next as unknown as RevisionProposal);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [requestMutation],
  );

  const applyRevision = useCallback(
    async (attemptId: number, next: RevisionProposal) => {
      setBusy(`apply:${attemptId}`);
      setActionError(null);
      try {
        await applyMutation({
          variables: { attemptId, proposal: next },
        });
        setProposal(null);
        refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [applyMutation, refresh],
  );

  const overrideDecision = useCallback(
    async (attemptId: number, resultId: number) => {
      setBusy(`override:${attemptId}`);
      setActionError(null);
      try {
        await overrideMutation({ variables: { attemptId, resultId } });
        refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [overrideMutation, refresh],
  );

  const optimizeDecision = useCallback(
    async (attemptId: number, expectedResultId: number, feedback?: string) => {
      setBusy(`optimize:${attemptId}`);
      setActionError(null);
      try {
        await optimizeMutation({
          variables: { attemptId, expectedResultId, feedback },
        });
        refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [optimizeMutation, refresh],
  );

  const editDecisionWording = useCallback(
    async (
      attemptId: number,
      input: {
        decisionPremise: string;
        instruction: string;
        optionDescriptions?: string[];
      },
    ) => {
      setBusy(`wording:${attemptId}`);
      setActionError(null);
      try {
        await editWordingMutation({ variables: { attemptId, ...input } });
        refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [editWordingMutation, refresh],
  );

  const addDecisionOption = useCallback(
    async (
      attemptId: number,
      option: {
        label: string;
        description?: string;
        value?: string;
        targetTaskId?: number | null;
      },
    ) => {
      setBusy(`option:${attemptId}`);
      setActionError(null);
      try {
        await addOptionMutation({ variables: { attemptId, ...option } });
        refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [addOptionMutation, refresh],
  );

  const {
    draftDecisionTarget,
    wireDecisionTarget,
    createDecisionTarget,
  } = useDecisionTargetActions({ refresh, setBusy, setActionError });

  const saveUserDecisionOptions = useCallback(
    async (
      attemptId: number,
      options: {
        id: number;
        label?: string;
        description?: string;
        value?: string;
      }[],
    ) => {
      setBusy(`options:${attemptId}`);
      setActionError(null);
      try {
        await saveOptionsMutation({ variables: { attemptId, options } });
        refresh();
      } catch (err) {
        setActionError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [refresh, saveOptionsMutation],
  );

  const cancel = useCallback(async () => {
    if (!runId) return;
    setBusy("cancel");
    setActionError(null);
    try {
      await cancelMutation({ variables: { runId } });
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, [cancelMutation, refresh, runId]);

  return useMemo(
    () => ({
      actionError,
      busy,
      proposal,
      clearProposal: () => setProposal(null),
      accept,
      requestRevision,
      applyRevision,
      overrideDecision,
      optimizeDecision,
      editDecisionWording,
      addDecisionOption,
      draftDecisionTarget,
      wireDecisionTarget,
      createDecisionTarget,
      saveUserDecisionOptions,
      cancel,
    }),
    [
      actionError,
      busy,
      proposal,
      accept,
      requestRevision,
      applyRevision,
      overrideDecision,
      optimizeDecision,
      editDecisionWording,
      addDecisionOption,
      draftDecisionTarget,
      wireDecisionTarget,
      createDecisionTarget,
      saveUserDecisionOptions,
      cancel,
    ],
  );
}
