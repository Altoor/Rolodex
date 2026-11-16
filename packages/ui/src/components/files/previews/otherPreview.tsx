import { EmptyState } from "#components/feedback/empty-state";
import { FileDownloadButton } from "../file-download-button";
import type { FileEntry } from "../types";

export function OtherPreview({ entry }: { entry: FileEntry }) {
  return (
    <EmptyState
      title="No preview for this file type"
      description={
        entry.mimeType
          ? `Previewing ${entry.mimeType} files is not supported yet.`
          : "Previewing this file type is not supported yet."
      }
      action={<FileDownloadButton entry={entry} />}
    />
  );
}
