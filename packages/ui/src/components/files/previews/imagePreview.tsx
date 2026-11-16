import { ErrorState } from "#components/feedback/error-state";
import { LoadingState } from "#components/feedback/loading-state";
import { useFileViewUrl } from "../file-view";
import type { FileEntry } from "../types";
import { MediaOpenLink } from "./mediaOpenLink";

export function ImagePreview({ entry }: { entry: FileEntry }) {
  const { url, loading, error, refetch } = useFileViewUrl(entry.id);

  if (loading) {
    return <LoadingState label="Loading image preview…" className="min-h-32" />;
  }

  if (error || !url) {
    return (
      <ErrorState
        title="Could not load image preview"
        error={error ?? "No URL was returned."}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Signed URLs expire, so a plain <img> is intentional here. */}
      <img
        src={url}
        alt={entry.name}
        className="max-h-[60vh] max-w-full rounded-lg object-contain"
      />
      <MediaOpenLink url={url} />
    </div>
  );
}
