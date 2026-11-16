"use client";

import { EmptyState } from "#components/feedback/empty-state";
import { FilePlaintextEditor } from "./file-plaintext-editor";
import { AudioPreview } from "./previews/audioPreview";
import { ImagePreview } from "./previews/imagePreview";
import { OtherPreview } from "./previews/otherPreview";
import { OversizedTextPreview } from "./previews/oversizedTextPreview";
import { TextPreview } from "./previews/textPreview";
import { VideoPreview } from "./previews/videoPreview";
import { TEXT_PREVIEW_MAX_BYTES, type FileEntry } from "./types";

interface FilePreviewProps {
  entry: FileEntry;
  onSaveText?: (content: string) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

/** Mirrors the backend's readable-text check so we do not request a preview
 * that the API will reject (for example PDF or DOCX). */
function canPreviewText(entry: FileEntry): boolean {
  if (entry.fileType === "plaintext") return true;
  if (entry.fileType !== "text") return false;

  const mimeType = entry.mimeType;
  return (
    !mimeType ||
    mimeType.startsWith("text/") ||
    mimeType === "application/x-tex"
  );
}

function isOversizedText(entry: FileEntry): boolean {
  const isText = entry.fileType === "plaintext" || entry.fileType === "text";
  return isText && entry.size !== null && entry.size > TEXT_PREVIEW_MAX_BYTES;
}

export function FilePreview({
  entry,
  onSaveText,
  onDirtyChange,
}: FilePreviewProps) {
  if (entry.kind === "folder") {
    return (
      <EmptyState
        title="Folder selected"
        description="Select a file from the tree to preview its contents."
      />
    );
  }

  if (entry.fileType === "text" && !canPreviewText(entry)) {
    return <OtherPreview entry={entry} />;
  }

  if (isOversizedText(entry)) {
    return <OversizedTextPreview entry={entry} />;
  }

  switch (entry.fileType) {
    case "plaintext":
      return onSaveText ? (
        <FilePlaintextEditor
          entry={entry}
          onSave={onSaveText}
          onDirtyChange={onDirtyChange}
        />
      ) : (
        <TextPreview entry={entry} />
      );
    case "text":
      return <TextPreview entry={entry} />;
    case "image":
      return <ImagePreview entry={entry} />;
    case "audio":
      return <AudioPreview entry={entry} />;
    case "video":
      return <VideoPreview entry={entry} />;
    default:
      return <OtherPreview entry={entry} />;
  }
}
