import { ErrorState } from "#components/feedback/error-state";
import { LoadingState } from "#components/feedback/loading-state";
import { useFileViewUrl } from "../file-view";
import type { FileEntry } from "../types";
import { MediaOpenLink } from "./mediaOpenLink";

export function VideoPreview({ entry }: { entry: FileEntry }) {
  const { url, loading, error, refetch } = useFileViewUrl(entry.id);

  if (loading) {
    return <LoadingState label="Loading video preview…" className="min-h-32" />;
  }

  if (error || !url) {
    return (
      <ErrorState
        title="Could not load video preview"
        error={error ?? "No URL was returned."}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <video
        controls
        src={url}
        className="max-h-[60vh] w-full rounded-lg bg-black"
      />
      <MediaOpenLink url={url} />
    </div>
  );
}
