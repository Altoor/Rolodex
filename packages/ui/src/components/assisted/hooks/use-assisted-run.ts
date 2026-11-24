"use client";

import { gql } from "@apollo/client";
import { useMutation, useQuery, useSubscription } from "@apollo/client/react";
import { useCallback, useMemo, useState } from "react";
import type {
  AssistedRun,
  NextTaskDraft,
  RevisionProposal,
  TraceEventRow,
} from "../types";

const ATTEMPT_FIELDS = `
  id
  queuedTaskId
  attemptNumber
  kind
  status
  taskSnapshot
  beforeState
  beforeToolState
  afterState
  afterToolState
  result
  effectJournal
  revision
  review
  workspaceKey
  createdAt
  finishedAt
  committedAt
`;

const RUN_FIELDS = `
  id
  status
  mode
  state
  startTaskId
  createdAt
  updatedAt
  steps {
    id
    taskId
    depth
    status
    state
    result
    pendingChoice
    task { id name type }
    attempts { ${ATTEMPT_FIELDS} }
    currentAttempt { ${ATTEMPT_FIELDS} }
  }
  attempts { ${ATTEMPT_FIELDS} }
`;

export const ASSISTED_RUN = gql(`
  query AssistedRun($runId: String!) {
    assistedRun(runId: $runId) { ${RUN_FIELDS} }
  }
`);

export const ACTIVE_ASSISTED_RUNS = gql(`
  query ActiveAssistedRuns {
    activeAssistedRuns { ${RUN_FIELDS} }
  }
`);

export const ASSISTED_RUN_HISTORY = gql(`
  query AssistedRunHistory($limit: Int, $offset: Int) {
    assistedRunHistory(limit: $limit, offset: $offset) { ${RUN_FIELDS} }
  }
`);

export const START_ASSISTED_RUN = gql(`
  mutation StartAssistedRun($input: JSON!) {
    startAssistedRun(input: $input) { ${RUN_FIELDS} }
  }
`);

export const ACCEPT_STEP_ATTEMPT = gql(`
  mutation AcceptStepAttempt($attemptId: Int!) {
    acceptStepAttempt(attemptId: $attemptId) { ${RUN_FIELDS} }
  }
`);

export const REQUEST_STEP_REVISION = gql(`
  mutation RequestStepRevision($attemptId: Int!, $feedback: String!) {
    requestStepRevision(attemptId: $attemptId, feedback: $feedback)
  }
`);

export const APPLY_STEP_REVISION = gql(`
  mutation ApplyStepRevision($attemptId: Int!, $proposal: JSON!) {
    applyStepRevision(attemptId: $attemptId, proposal: $proposal) { ${RUN_FIELDS} }
  }
`);

export const OVERRIDE_DECISION = gql(`
  mutation OverrideDecision($attemptId: Int!, $resultId: Int!) {
    overrideDecision(attemptId: $attemptId, resultId: $resultId) { ${RUN_FIELDS} }
  }
`);

export const OPTIMIZE_DECISION = gql(`
  mutation OptimizeDecision(
    $attemptId: Int!
    $expectedResultId: Int!
    $feedback: String
  ) {
    optimizeDecision(
      attemptId: $attemptId
      expectedResultId: $expectedResultId
      feedback: $feedback
    ) { ${RUN_FIELDS} }
  }
`);

export const EDIT_DECISION_WORDING = gql(`
  mutation EditDecisionWording(
    $attemptId: Int!
    $decisionPremise: String!
    $instruction: String!
    $optionDescriptions: [String!]
  ) {
    editDecisionWording(
      attemptId: $attemptId
      decisionPremise: $decisionPremise
      instruction: $instruction
      optionDescriptions: $optionDescriptions
    ) { ${RUN_FIELDS} }
  }
`);

export const ADD_DECISION_OPTION = gql(`
  mutation AddDecisionOption(
    $attemptId: Int!
    $label: String!
    $description: String
    $value: String
    $targetTaskId: Int
  ) {
    addDecisionOption(
      attemptId: $attemptId
      label: $label
      description: $description
      value: $value
      targetTaskId: $targetTaskId
    ) { ${RUN_FIELDS} }
  }
`);

export const DRAFT_DECISION_TARGET_TASK = gql(`
  mutation DraftDecisionTargetTask(
    $attemptId: Int!
    $feedback: String
    $draft: JSON
  ) {
    draftDecisionTargetTask(
      attemptId: $attemptId
      feedback: $feedback
      draft: $draft
    )
  }
`);

export const WIRE_DECISION_TARGET_TASK = gql(`
  mutation WireDecisionTargetTask(
    $attemptId: Int!
    $resultId: Int!
    $targetTaskId: Int!
  ) {
    wireDecisionTargetTask(
      attemptId: $attemptId
      resultId: $resultId
      targetTaskId: $targetTaskId
    ) { ${RUN_FIELDS} }
  }
`);

export const CREATE_DECISION_TARGET_TASK = gql(`
  mutation CreateDecisionTargetTask(
    $attemptId: Int!
    $resultId: Int!
    $draft: JSON!
  ) {
    createDecisionTargetTask(
      attemptId: $attemptId
      resultId: $resultId
      draft: $draft
    ) { ${RUN_FIELDS} }
  }
`);

export const CANCEL_ASSISTED_RUN = gql(`
  mutation CancelAssistedRun($runId: String!) {
    cancelAssistedRun(runId: $runId)
  }
`);

export const SAVE_USER_DECISION_OPTIONS = gql(`
  mutation SaveUserDecisionOptions($attemptId: Int!, $options: JSON!) {
    saveUserDecisionOptions(attemptId: $attemptId, options: $options) {
      ${RUN_FIELDS}
    }
  }
`);

const TRACE_EVENT_FIELDS = `
  id
  attemptId
  sequence
  kind
  payload
  createdAt
`;

export const ATTEMPT_TRACE = gql(`
  query AttemptTrace($attemptId: Int!) {
    attemptTrace(attemptId: $attemptId) { ${TRACE_EVENT_FIELDS} }
  }
`);

export const ASSISTED_TRACE_EVENT = gql(`
  subscription AssistedTraceEvent($runId: String!) {
    assistedTraceEvent(runId: $runId) { ${TRACE_EVENT_FIELDS} }
  }
`);

interface AssistedRunQueryData {
  assistedRun: AssistedRun | null;
}

interface MutationData {
  [key: string]: AssistedRun | null;
}

/** Live assisted-run read model plus the review mutations. */
export function useAssistedRun(runId: string | null) {
  const { data, loading, error, refetch } = useQuery<AssistedRunQueryData>(
    ASSISTED_RUN,
    {
      variables: { runId },
      skip: !runId,
      fetchPolicy: "network-only",
    },
  );

  const [acceptMutation] = useMutation(ACCEPT_STEP_ATTEMPT);
  const [requestMutation] = useMutation(REQUEST_STEP_REVISION);
  const [applyMutation] = useMutation(APPLY_STEP_REVISION);
  const [overrideMutation] = useMutation(OVERRIDE_DECISION);
  const [optimizeMutation] = useMutation(OPTIMIZE_DECISION);
  const [editWordingMutation] = useMutation(EDIT_DECISION_WORDING);
  const [addOptionMutation] = useMutation(ADD_DECISION_OPTION);
  const [draftTargetMutation] = useMutation(DRAFT_DECISION_TARGET_TASK);
  const [wireTargetMutation] = useMutation(WIRE_DECISION_TARGET_TASK);
  const [createTargetMutation] = useMutation(CREATE_DECISION_TARGET_TASK);
  const [saveOptionsMutation] = useMutation(SAVE_USER_DECISION_OPTIONS);
  const [cancelMutation] = useMutation(CANCEL_ASSISTED_RUN);

  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [proposal, setProposal] = useState<RevisionProposal | null>(null);

  const run = data?.assistedRun ?? null;

  const refresh = useCallback(() => {
    if (runId) void refetch();
  }, [refetch, runId]);

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
    [draftTargetMutation],
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
    [refresh, wireTargetMutation],
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
    [createTargetMutation, refresh],
  );

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
      run,
      loading,
      error: error?.message ?? null,
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
      refresh,
    }),
    [
      run,
      loading,
      error,
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
      refresh,
    ],
  );
}

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

/**
 * Loads an attempt's trace, then appends new events from the run subscription
 * while the panel is open. The subscription is scoped to the run so live
 * events from a still-running attempt are not missed between polls.
 */
export function useAttemptTrace(
  runId: string | null,
  attemptId: number | null,
) {
  const { data, loading } = useQuery<{ attemptTrace: TraceEventRow[] }>(
    ATTEMPT_TRACE,
    {
      variables: { attemptId },
      skip: !attemptId,
      fetchPolicy: "cache-and-network",
    },
  );

  const streamKey = `${runId ?? ""}:${attemptId ?? ""}`;
  const [streamed, setStreamed] = useState<{
    key: string;
    events: TraceEventRow[];
  }>({ key: streamKey, events: [] });

  useSubscription<{ assistedTraceEvent: TraceEventRow }>(
    ASSISTED_TRACE_EVENT,
    {
      variables: { runId },
      skip: !runId || !attemptId,
      onData: ({ data: result }) => {
        const incoming = result.data?.assistedTraceEvent;
        if (!incoming || incoming.attemptId !== attemptId) return;
        setStreamed((previous) => {
          const events = previous.key === streamKey ? previous.events : [];
          if (events.some((event) => event.id === incoming.id)) return previous;
          return { key: streamKey, events: [...events, incoming] };
        });
      },
    },
  );

  const events = useMemo(() => {
    const byId = new Map<number, TraceEventRow>();
    for (const event of data?.attemptTrace ?? []) byId.set(event.id, event);
    for (const event of streamed.key === streamKey ? streamed.events : []) {
      byId.set(event.id, event);
    }
    return [...byId.values()].sort((a, b) => a.sequence - b.sequence);
  }, [data, streamKey, streamed]);

  return { events, loading };
}
