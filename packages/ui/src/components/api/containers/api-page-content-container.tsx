"use client";

import { useQuery } from "@apollo/client/react";
import { API_ENDPOINTS } from "@repo/queries/api/api-queries";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { useState } from "react";
import { ApiPageContent } from "../organisms/api-page-content";
import type { ApiEndpoint, RevealedKey, TaskOption } from "../lib/api-utils";

/** Loads endpoints and tasks for the API page. */
export function ApiPageContentContainer() {
  const [revealedKey, setRevealedKey] = useState<RevealedKey | null>(null);
  const endpointsQuery = useQuery(API_ENDPOINTS, {
    fetchPolicy: "cache-and-network",
  });
  const tasksQuery = useQuery(TASKS);

  const endpoints = (endpointsQuery.data?.apiEndpoints ?? []).filter(
    (endpoint): endpoint is ApiEndpoint => Boolean(endpoint),
  );
  const tasks: TaskOption[] = (tasksQuery.data?.tasks ?? []).flatMap((task) =>
    task && task.id != null && task.name != null
      ? [{ id: task.id, name: task.name }]
      : [],
  );

  return (
    <ApiPageContent
      endpoints={endpoints}
      tasks={tasks}
      revealedKey={revealedKey}
      loading={endpointsQuery.loading && !endpointsQuery.data}
      error={endpointsQuery.error}
      onRetry={() => void endpointsQuery.refetch()}
      onDismissKey={() => setRevealedKey(null)}
      onKey={setRevealedKey}
    />
  );
}
