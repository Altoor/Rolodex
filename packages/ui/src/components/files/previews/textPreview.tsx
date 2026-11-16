import { useQuery } from "@apollo/client/react";
import { GET_FILE_TEXT } from "@repo/queries/files/file-queries";
import { ErrorState } from "#components/feedback/error-state";
import { LoadingState } from "#components/feedback/loading-state";
import type { FileEntry } from "../types";

export function TextPreview({ entry }: { entry: FileEntry }) {
  const { data, loading, error, refetch } = useQuery(GET_FILE_TEXT, {
    variables: { id: entry.id },
    fetchPolicy: "cache-and-network",
  });

  if (loading) {
    return <LoadingState label="Loading text preview…" className="min-h-32" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load text preview"
        error={error}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const text = data?.getFileText ?? "";

  return (
    <pre className="max-h-[55vh] overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
      {text || "(empty file)"}
    </pre>
  );
}
