"use client";

import { useQuery } from "@apollo/client/react";
import { API_ENDPOINTS } from "@repo/queries/api/api-queries";
import { TASKS } from "@repo/queries/tasks/task-queries";
import { useState } from "react";
import { EmptyState } from "#components/feedback/empty-state";
import { ErrorState } from "#components/feedback/error-state";
import { LoadingState } from "#components/feedback/loading-state";
import { PageContainer } from "#components/layout/page-container";
import { PageHeader } from "#components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "#components/ui/card";
import { ApiCreateForm } from "./api-create-form";
import { ApiEndpointCard } from "./api-endpoint-card";
import { ApiKeyBanner } from "./api-key-banner";
import { type ApiEndpoint } from "./api-utils";

interface RevealedKey {
  apiKey: string;
  endpointName: string;
}

export function ApiPageContent() {
  const [revealedKey, setRevealedKey] = useState<RevealedKey | null>(null);
  const endpointsQuery = useQuery(API_ENDPOINTS, {
    fetchPolicy: "cache-and-network",
  });
  const tasksQuery = useQuery(TASKS);

  if (endpointsQuery.loading && !endpointsQuery.data) {
    return (
      <PageContainer>
        <LoadingState label="Loading API endpoints…" />
      </PageContainer>
    );
  }

  if (endpointsQuery.error) {
    return (
      <PageContainer>
        <ErrorState
          title="Could not load API endpoints"
          error={endpointsQuery.error}
          onRetry={() => void endpointsQuery.refetch()}
        />
      </PageContainer>
    );
  }

  const endpoints = (endpointsQuery.data?.apiEndpoints ?? []).filter(
    (endpoint): endpoint is ApiEndpoint => Boolean(endpoint),
  );
  const tasks = (tasksQuery.data?.tasks ?? []).flatMap((task) =>
    task && task.id != null && task.name != null
      ? [{ id: task.id, name: task.name }]
      : [],
  );

  return (
    <PageContainer>
      <PageHeader
        title="API"
        description="Create REST links that queue a task. Poll the status URL or subscribe over WebSocket, and let a flow publish its result with the end_flow tool."
      />

      {revealedKey ? (
        <div className="mb-4">
          <ApiKeyBanner
            endpointName={revealedKey.endpointName}
            apiKey={revealedKey.apiKey}
            onDismiss={() => setRevealedKey(null)}
          />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex flex-col gap-4">
          {endpoints.length === 0 ? (
            <EmptyState
              title="No API links yet"
              description="Create an endpoint and assign it a task to start accepting requests."
            />
          ) : (
            endpoints.map((endpoint) => (
              <ApiEndpointCard
                key={endpoint.id}
                endpoint={endpoint}
                tasks={tasks}
                onKey={setRevealedKey}
              />
            ))
          )}
        </div>

        <div className="flex flex-col gap-4">
          <ApiCreateForm
            tasks={tasks}
            onCreated={(input) => setRevealedKey(input)}
          />

          <Card>
            <CardHeader>
              <CardTitle>How it works</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
              <p>
                Every request queues the assigned task as a normal standard
                run. The response is an acceptance receipt with a status URL.
              </p>
              <p>
                Send <code className="font-mono">Authorization: Bearer …</code>{" "}
                or <code className="font-mono">X-API-Key</code>. WebSocket
                clients may pass <code className="font-mono">?key=</code>.
              </p>
              <p>
                Add an <code className="font-mono">end_flow</code> tool to the
                task graph to publish a result. Its config chooses which part of
                the tool state to return and display.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
