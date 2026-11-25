import { EventEmitter } from "node:events";
import { eq, sql } from "drizzle-orm";
import { db, traceEvents } from "@repo/db";

export const assistedEvents = new EventEmitter();
assistedEvents.setMaxListeners(0);

const MAX_PAYLOAD_LENGTH = 8_000;

function redact(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_PAYLOAD_LENGTH
      ? `${value.slice(0, MAX_PAYLOAD_LENGTH)}… [truncated]`
      : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 100).map(redact);
  }

  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (/authorization|password|token|secret/i.test(key)) {
        result[key] = "[redacted]";
      } else {
        result[key] = redact(entry);
      }
    }
    return result;
  }

  return value;
}

export interface RecordTraceInput {
  runId: string;
  attemptId?: number | null;
  kind: string;
  payload?: unknown;
}

/**
 * True when a trace insert failed because the attempt was deleted while the
 * caller was still working. Cancelling a run removes its uncommitted attempts,
 * so a long model call can outlive the row it is tracing against.
 */
function isMissingAttempt(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, constraint, detail } = error as {
    code?: string;
    constraint?: string;
    detail?: string;
  };
  return (
    code === "23503" &&
    ((constraint?.includes("attemptId") ?? false) ||
      (detail?.includes("attemptId") ?? false))
  );
}

async function insertTrace(
  input: RecordTraceInput,
  attemptId: number | null,
) {
  const [current] = await db
    .select({
      sequence: sql<number>`coalesce(max(${traceEvents.sequence}), 0)`,
    })
    .from(traceEvents)
    .where(eq(traceEvents.runId, input.runId));

  const [event] = await db
    .insert(traceEvents)
    .values({
      runId: input.runId,
      attemptId,
      sequence: Number(current?.sequence ?? 0) + 1,
      kind: input.kind,
      payload: redact(input.payload ?? null),
    })
    .returning();

  if (event) {
    assistedEvents.emit("trace", { runId: input.runId, event });
  }

  return event;
}

/** Appends a redacted, truncated trace event and streams it to subscribers. */
export async function recordTrace(input: RecordTraceInput) {
  const attemptId = input.attemptId ?? null;

  try {
    return await insertTrace(input, attemptId);
  } catch (error) {
    // The attempt disappeared mid-flight (the run was cancelled or deleted).
    // Keep the trace on the run instead of failing with a cryptic FK error.
    if (attemptId != null && isMissingAttempt(error)) {
      return insertTrace(input, null);
    }
    throw error;
  }
}

export function publishAssistedRunEvent(runId: string): void {
  assistedEvents.emit("run", { runId });
}
