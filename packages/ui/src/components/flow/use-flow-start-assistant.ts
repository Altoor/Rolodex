"use client";

import { useMutation } from "@apollo/client/react";
import {
  CONFIRM_FLOW_START_DRAFT,
  DRAFT_FLOW_START_TASK,
  PROPOSE_FLOW_START,
  REFINE_FLOW_START_PROPOSAL,
  REFINE_FLOW_TASK_DRAFT,
} from "@repo/queries/flow/flow-mutations";
import { CREATE_QUEUED_TASK } from "@repo/queries/tasks/task-mutations";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { useCallback, useRef, useState } from "react";
import {
  isDraftRunnable,
  toFlowStartProposal,
  toFlowTaskDraft,
  type FlowStartCandidate,
  type FlowStartKind,
  type FlowStartProposal,
  type FlowTaskDraft,
} from "./flow-model";
import { toStep, type QueuedTaskStep } from "../landing/landing-model";

type BusyAction = "propose" | "refine" | "draft" | "refineDraft" | "confirm";

interface UseFlowStartAssistantArgs {
  onTrackedStep: (step: QueuedTaskStep) => void;
  onOpenRun: (runId: string) => void;
  /** Clears the landing composer once a run has actually started. */
  onStarted: () => void;
}

export interface FlowStartAssistantState {
  proposal: FlowStartProposal | null;
  draft: FlowTaskDraft | null;
  selectedKey: string | null;
  selectedCandidate: FlowStartCandidate | null;
  busy: BusyAction | null;
  error: string | null;
  notice: string | null;
  propose: (state: string, fileIds: number[]) => Promise<void>;
  selectCandidate: (key: string) => void;
  refineProposal: (prompt: string) => Promise<void>;
  buildCandidate: (candidate: FlowStartCandidate) => Promise<void>;
  refineDraft: (prompt: string) => Promise<void>;
  updateDraft: (draft: FlowTaskDraft) => void;
  confirmDraft: (start: boolean) => Promise<void>;
  cancel: () => void;
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Owns the landing auto-start state machine: proposal, refinement, draft, and
 * confirmation. Model output is normalized before it reaches the UI.
 */
export function useFlowStartAssistant({
  onTrackedStep,
  onOpenRun,
  onStarted,
}: UseFlowStartAssistantArgs): FlowStartAssistantState {
  const [proposal, setProposal] = useState<FlowStartProposal | null>(null);
  const [draft, setDraft] = useState<FlowTaskDraft | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const stateRef = useRef("");
  const fileIdsRef = useRef<number[]>([]);
  const draftRef = useRef<FlowTaskDraft | null>(null);
  const proposalRef = useRef<FlowStartProposal | null>(null);
  const selectedKeyRef = useRef<string | null>(null);

  const [proposeMutation] = useMutation(PROPOSE_FLOW_START);
  const [refineProposalMutation] = useMutation(REFINE_FLOW_START_PROPOSAL);
  const [draftMutation] = useMutation(DRAFT_FLOW_START_TASK);
  const [refineDraftMutation] = useMutation(REFINE_FLOW_TASK_DRAFT);
  const [confirmMutation] = useMutation(CONFIRM_FLOW_START_DRAFT, {
    refetchQueries: [TASKS],
  });
  const [createQueuedTask] = useMutation(CREATE_QUEUED_TASK);

  const setDraftState = useCallback((next: FlowTaskDraft | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const setProposalState = useCallback((next: FlowStartProposal | null) => {
    proposalRef.current = next;
    setProposal(next);
  }, []);

  const selectCandidate = useCallback((key: string) => {
    selectedKeyRef.current = key;
    setSelectedKey(key);
  }, []);

  const reset = useCallback(() => {
    stateRef.current = "";
    fileIdsRef.current = [];
    setProposalState(null);
    setDraftState(null);
    selectedKeyRef.current = null;
    setSelectedKey(null);
    setError(null);
    setNotice(null);
  }, [setDraftState, setProposalState]);

  const propose = async (state: string, fileIds: number[]) => {
    if (busy) return;

    stateRef.current = state;
    fileIdsRef.current = fileIds;
    setBusy("propose");
    setError(null);
    setNotice(null);

    try {
      const { data } = await proposeMutation({
        variables: { state, fileIds },
      });
      const next = toFlowStartProposal(data?.proposeFlowStart);
      if (!next) throw new Error("The model returned no usable proposal");

      setProposalState(next);
      setDraftState(null);
      selectCandidate(next.recommendedKey);
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setBusy(null);
    }
  };

  const refineProposal = async (prompt: string) => {
    const current = proposalRef.current;
    const selected = selectedKeyRef.current;
    if (!current || !prompt.trim() || busy) return;

    setBusy("refine");
    setError(null);
    setNotice(null);

    try {
      const { data } = await refineProposalMutation({
        variables: {
          state: stateRef.current,
          selectedKey: selected || current.recommendedKey,
          prompt,
          fileIds: fileIdsRef.current,
        },
      });
      const next = toFlowStartProposal(data?.refineFlowStartProposal);
      if (!next) throw new Error("The model returned no usable proposal");

      setProposalState(next);
      setDraftState(null);
      selectCandidate(next.recommendedKey);
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setBusy(null);
    }
  };

  const startExisting = async (taskId: number) => {
    const { data } = await createQueuedTask({
      variables: {
        taskId,
        state: stateRef.current,
        fileIds: fileIdsRef.current,
      },
    });

    const step = data?.createQueuedTask
      ? toStep(data.createQueuedTask)
      : null;
    if (step) {
      onTrackedStep(step);
      onOpenRun(step.runId);
    }

    reset();
    onStarted();
  };

  const buildCandidate = async (candidate: FlowStartCandidate) => {
    if (busy) return;

    if (candidate.kind === "existingTask") {
      if (candidate.taskId == null) {
        setError("This candidate has no task to start");
        return;
      }

      setBusy("confirm");
      setError(null);
      try {
        await startExisting(candidate.taskId);
      } catch (err) {
        setError(messageFrom(err));
      } finally {
        setBusy(null);
      }
      return;
    }

    setBusy("draft");
    setError(null);
    setNotice(null);

    try {
      const { data } = await draftMutation({
        variables: {
          kind: candidate.kind as FlowStartKind,
          state: stateRef.current,
          fileIds: fileIdsRef.current,
        },
      });
      const next = toFlowTaskDraft(data?.draftFlowStartTask);
      if (!next) throw new Error("The model returned no usable draft");
      setDraftState(next);
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setBusy(null);
    }
  };

  const refineDraft = async (prompt: string) => {
    const current = draftRef.current;
    if (!current || !prompt.trim() || busy) return;

    setBusy("refineDraft");
    setError(null);
    setNotice(null);

    try {
      const { data } = await refineDraftMutation({
        variables: {
          draft: current as unknown as Record<string, unknown>,
          state: stateRef.current,
          prompt,
        },
      });
      const next = toFlowTaskDraft(data?.refineFlowTaskDraft);
      if (!next) throw new Error("The model returned no usable draft");
      setDraftState(next);
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setBusy(null);
    }
  };

  const confirmDraft = async (start: boolean) => {
    const current = draftRef.current;
    if (!current || busy) return;

    if (start && !isDraftRunnable(current)) {
      setError("This draft cannot be run yet. Create it only, or fix the warning.");
      return;
    }

    setBusy("confirm");
    setError(null);
    setNotice(null);

    try {
      const { data } = await confirmMutation({
        variables: {
          draft: current as unknown as Record<string, unknown>,
          state: stateRef.current,
          fileIds: fileIdsRef.current,
          start,
        },
      });

      const result = data?.confirmFlowStartDraft;
      const step = result?.queuedTask
        ? toStep(result.queuedTask)
        : null;
      if (step) {
        onTrackedStep(step);
        onOpenRun(step.runId);
      }

      reset();
      if (step) onStarted();
      else setNotice(`Created "${result?.taskName ?? current.name}".`);
    } catch (err) {
      setError(messageFrom(err));
    } finally {
      setBusy(null);
    }
  };

  const selectedCandidate =
    proposal?.candidates.find(
      (candidate) => candidate.key === (selectedKey ?? proposal.recommendedKey),
    ) ?? null;

  return {
    proposal,
    draft,
    selectedKey,
    selectedCandidate,
    busy,
    error,
    notice,
    propose,
    selectCandidate,
    refineProposal,
    buildCandidate,
    refineDraft,
    updateDraft: setDraftState,
    confirmDraft,
    cancel: () => {
      reset();
    },
  };
}
