"use client";

import { EmptyState } from "#components/feedback/empty-state";
import { ErrorState } from "#components/feedback/error-state";
import { LoadingState } from "#components/feedback/loading-state";
import { PageContainer } from "#components/layout/page-container";
import { PageHeader } from "#components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "#components/ui/card";
import { ApiCreateFormContainer } from "../containers/api-create-form-container";
import { ApiEndpointCardContainer } from "../containers/api-endpoint-card-container";
import { ApiStandardSectionContainer } from "../containers/api-standard-section-container";
import { ApiKeyBanner } from "../molecules/api-key-banner";
import type { ApiEndpoint, RevealedKey, TaskOption } from "../lib/api-utils";

interface ApiPageContentProps {
  endpoints: ApiEndpoint[];
  tasks: TaskOption[];
  revealedKey: RevealedKey | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  onDismissKey: () => void;
  onKey: (key: RevealedKey) => void;
}

/** Presentational API page: key banner, endpoint list, create form, docs. */
export function ApiPageContent({
  endpoints,
  tasks,
  revealedKey,
  loading,
  error,
  onRetry,
  onDismissKey,
  onKey,
}: ApiPageContentProps) {
  if (loading) {
    return (
      <PageContainer>
        <LoadingState label="Loading API endpoints…" />
      </PageContainer>
    );
  }

  if (error) {
    return (
      <PageContainer>
        <ErrorState
          title="Could not load API endpoints"
          error={error}
          onRetry={onRetry}
        />
      </PageContainer>
    );
  }

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
            onDismiss={onDismissKey}
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
              <ApiEndpointCardContainer
                key={endpoint.id}
                endpoint={endpoint}
                tasks={tasks}
                onKey={onKey}
              />
            ))
          )}

          <ApiStandardSectionContainer onKey={onKey} />
        </div>

        <div className="flex flex-col gap-4">
          <ApiCreateFormContainer tasks={tasks} onCreated={onKey} />

          <Card>
            <CardHeader>
              <CardTitle>How it works</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
              <p>
                Every request queues the assigned task as a normal standard run.
                The response is an acceptance receipt with a status URL.
              </p>
              <p>
                Send <code className="font-mono">Authorization: Bearer …</code>{" "}
                or <code className="font-mono">X-API-Key</code>. Query-string
                keys are accepted only for WebSocket upgrades.
              </p>
              <p>
                Endpoint keys can invoke their own hook but cannot read the{" "}
                <code className="font-mono">/api/v1</code> account routes; those
                require the standard key.
              </p>
              <p>
                Add an <code className="font-mono">end_flow</code> tool to the
                task graph to publish a result. Its config chooses which part of
                the tool state to return and display.
              </p>
              <p>
                To attach files, send{" "}
                <code className="font-mono">multipart/form-data</code> instead:
                put the state in a form field and repeat{" "}
                <code className="font-mono">&apos;files=@…&apos;</code> for each
                file. Up to 20 files (25 MiB each, 50 MiB per request) are
                uploaded and seeded into the run&apos;s tool state as{" "}
                <code className="font-mono">files</code>.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}
