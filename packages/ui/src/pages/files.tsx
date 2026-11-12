"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { RefreshCw } from "lucide-react";
import { GET_FILE_ENTRIES } from "@repo/queries/files/file-queries";
import { INDEX_FILE_TREE } from "@repo/queries/files/file-mutations";
import { AuthGate } from "../components/auth/auth-gate";
import { EmptyState } from "#components/feedback/empty-state";
import { ErrorState } from "#components/feedback/error-state";
import { LoadingState } from "#components/feedback/loading-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#components/ui/card";
import { Button } from "#components/ui/button";
import { Separator } from "#components/ui/separator";
import { Spinner } from "#components/ui/spinner";
import { FileMetadata, FilePreview } from "../components/files/file-preview";
import { FilePreviewHeader } from "../components/files/file-preview-header";
import { FileTreeView } from "../components/files/file-tree-view";
import {
  buildFileTree,
  getAncestors,
  toFileEntry,
  type FileEntry,
  type FileTreeNode,
} from "../components/files/types";
import { PageContainer } from "#components/layout/page-container";
import { PageHeader } from "#components/layout/page-header";

export default function FilesPage() {
  return (
    <AuthGate>
      <FilesPageContent />
    </AuthGate>
  );
}

function FilesPageContent() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(
    () => new Set<number>(),
  );
  const [refreshError, setRefreshError] = useState<unknown>(null);

  const { data, loading, error, refetch } = useQuery(GET_FILE_ENTRIES, {
    fetchPolicy: "cache-and-network",
  });
  const [indexFileTree, { loading: refreshing }] = useMutation(INDEX_FILE_TREE);

  const entries = useMemo(
    () =>
      (data?.fileEntries ?? []).flatMap((fragment) => {
        const entry = toFileEntry(fragment);
        return entry ? [entry] : [];
      }),
    [data],
  );

  const byId = useMemo(
    () => new Map<number, FileEntry>(entries.map((entry) => [entry.id, entry])),
    [entries],
  );
  const tree = useMemo(() => buildFileTree(entries), [entries]);

  const selectedEntry = selectedId === null ? undefined : byId.get(selectedId);
  const ancestors = selectedEntry ? getAncestors(selectedEntry.id, byId) : [];

  const expandAncestors = (id: number) => {
    const ancestorIds = getAncestors(id, byId).map((entry) => entry.id);

    setExpandedIds((current) => {
      const next = new Set(current);
      for (const ancestorId of ancestorIds) next.add(ancestorId);
      return next;
    });
  };

  const handleSelect = (entry: FileTreeNode) => {
    expandAncestors(entry.id);
    setSelectedId(entry.id);
  };

  const handleToggle = (id: number, open: boolean) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleBreadcrumbFolder = (id: number | null) => {
    if (id === null) {
      setSelectedId(null);
      return;
    }

    expandAncestors(id);
    setExpandedIds((current) => new Set(current).add(id));
    setSelectedId(id);
  };

  const handleRefresh = async () => {
    setRefreshError(null);

    try {
      await indexFileTree({ variables: { apply: true } });
      await refetch();
    } catch (err) {
      setRefreshError(err);
    }
  };

  const loadingEntries = loading && entries.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title="Files"
        description="Browse the shared file tree and preview each file."
      />

      {error ? (
        <ErrorState
          title="Could not load files"
          error={error}
          onRetry={() => {
            void refetch();
          }}
        />
      ) : null}

      {refreshError ? (
        <ErrorState
          title="Could not refresh the file tree"
          error={refreshError}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
        <Card className="lg:sticky lg:top-4 lg:self-start">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle>File tree</CardTitle>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  void handleRefresh();
                }}
                disabled={refreshing}
              >
                {refreshing ? <Spinner className="size-3.5" /> : <RefreshCw />}
                {refreshing ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
            <CardDescription>
              Indexes the files/ directory, then reloads the list.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[65vh] overflow-auto">
            {loadingEntries ? (
              <LoadingState label="Loading files…" />
            ) : entries.length === 0 ? (
              <EmptyState
                title="No files yet"
                description="Add files to the files/ directory, then click Refresh."
              />
            ) : (
              <FileTreeView
                nodes={tree}
                selectedId={selectedEntry?.id ?? null}
                expandedIds={expandedIds}
                onSelect={handleSelect}
                onToggle={handleToggle}
              />
            )}
          </CardContent>
        </Card>

        <Card className="min-h-[28rem]">
          <CardContent className="flex flex-col gap-4">
            {loadingEntries ? (
              <LoadingState label="Loading files…" />
            ) : selectedEntry ? (
              <>
                <FilePreviewHeader
                  entry={selectedEntry}
                  ancestors={ancestors}
                  onSelectFolder={handleBreadcrumbFolder}
                />
                <Separator />
                <FilePreview key={selectedEntry.id} entry={selectedEntry} />
                <Separator />
                <FileMetadata entry={selectedEntry} />
              </>
            ) : (
              <EmptyState
                title={entries.length === 0 ? "No files yet" : "Select a file"}
                description={
                  entries.length === 0
                    ? "Files placed in the files/ directory will appear here after you refresh."
                    : "Choose a file from the tree to see its preview and metadata."
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
