import { EmptyState } from "#components/feedback/empty-state";
import { FileDownloadButton } from "../file-download-button";
import { formatBytes, TEXT_PREVIEW_MAX_BYTES, type FileEntry } from "../types";

export function OversizedTextPreview({ entry }: { entry: FileEntry }) {
  return (
    <EmptyState
      title="This text file is too large to preview"
      description={`The preview limit is ${formatBytes(TEXT_PREVIEW_MAX_BYTES)}. Download the file to view its full contents.`}
      action={<FileDownloadButton entry={entry} />}
    />
  );
}
