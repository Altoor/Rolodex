import type { ApolloCache } from "@apollo/client/core";

/**
 * Reflects a task link change in the Apollo cache immediately, so the flow
 * updates right away instead of waiting for the refetch to round-trip.
 */
export const setTaskFieldInCache = (
  cache: ApolloCache,
  taskId: number,
  field: "fallbackTaskId" | "onTrueTaskId" | "onFalseTaskId",
  value: number | null,
) => {
  const ref = cache.identify({ __typename: "Task", id: taskId });
  if (!ref) return;
  cache.modify({
    id: ref,
    fields: { [field]: () => value },
  });
};

/** Reflects a switch toolConfig change on a Task entity immediately. */
export const setTaskToolConfigInCache = (
  cache: ApolloCache,
  taskId: number,
  toolConfig: unknown,
) => {
  const ref = cache.identify({ __typename: "Task", id: taskId });
  if (!ref) return;
  cache.modify({
    id: ref,
    fields: { toolConfig: () => toolConfig },
  });
};

/** Reflects a resultTaskId change on a TaskResult entity immediately. */
export const setResultTaskIdInCache = (  cache: ApolloCache,
  resultId: number,
  resultTaskId: number | null,
) => {
  const ref = cache.identify({ __typename: "TaskResult", id: resultId });
  if (!ref) return;
  cache.modify({
    id: ref,
    fields: { resultTaskId: () => resultTaskId },
  });
};
