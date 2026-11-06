"use client";

import { useQuery } from "@apollo/client/react";
import { TOOLS } from "@repo/queries/tools/tool-queries";
import { AuthGate } from "../components/auth/auth-gate";
import { EmptyState } from "#components/feedback/empty-state";
import { ErrorState } from "#components/feedback/error-state";
import { LoadingState } from "#components/feedback/loading-state";
import { PageContainer } from "#components/layout/page-container";
import { PageHeader } from "#components/layout/page-header";
import ToolCard from "../components/tools/toolCard";

export default function ToolsPage() {
  return (
    <AuthGate>
      <ToolsPageContent />
    </AuthGate>
  );
}

function ToolsPageContent() {
  const { data, error, loading } = useQuery(TOOLS);
  const tools = data?.tools ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="Tools"
        description="Inspect, configure, and test the tools that tool tasks can run."
      />

      {loading ? (
        <LoadingState label="Loading tools…" />
      ) : error ? (
        <ErrorState title="Could not load tools" error={error} />
      ) : tools.length === 0 ? (
        <EmptyState
          title="No tools available"
          description="The tool registry is empty."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {tools.map((tool) => (
            <ToolCard key={tool.key ?? tool.name} tool={tool} />
          ))}
        </div>
      )}
    </PageContainer>
  );
}
