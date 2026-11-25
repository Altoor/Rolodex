"use client";

import { useQuery, useSubscription } from "@apollo/client/react";
import { useMemo, useState } from "react";
import type { TraceEventRow } from "../types";
import { ASSISTED_TRACE_EVENT, ATTEMPT_TRACE } from "./assisted-documents";

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
