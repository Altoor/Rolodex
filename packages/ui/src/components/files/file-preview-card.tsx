import { EmptyState } from "#components/feedback/empty-state";
import { LoadingState } from "#components/feedback/loading-state";
import { Card, CardContent } from "#components/ui/card";
import { Separator } from "#components/ui/separator";
import { FileMetadataEditor } from "./file-metadata-editor";
import { FileMetadata } from "./file-metadata";
import { FilePreview } from "./file-preview";
import { FilePreviewHeader } from "./file-preview-header";
import type { FileEntry } from "./types";

interface FilePreviewCardProps {
  entry: FileEntry | undefined;
  ancestors: FileEntry[];
  entryCount: number;
  loading: boolean;
  editingMetadata: boolean;
  onSelectFolder: (id: number | null) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onDelete: () => void;
  onSaveMetadata: (values: {
    name: string;
    description: string;
  }) => Promise<void>;
  onSaveText: (content: string) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
}

export function FilePreviewCard({
  entry,
  ancestors,
  entryCount,
  loading,
  editingMetadata,
  onSelectFolder,
  onEdit,
  onCancelEdit,
  onDelete,
  onSaveMetadata,
  onSaveText,
  onDirtyChange,
}: FilePreviewCardProps) {
  return (
    <Card className="min-h-[28rem]">
      <CardContent className="flex flex-col gap-4">
        {loading ? (
          <LoadingState label="Loading files…" />
        ) : entry ? (
          <>
            {editingMetadata ? (
              <FileMetadataEditor
                entry={entry}
                onSave={onSaveMetadata}
                onCancel={onCancelEdit}
              />
            ) : (
              <FilePreviewHeader
                entry={entry}
                ancestors={ancestors}
                onSelectFolder={onSelectFolder}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            )}
            <Separator />
            <FilePreview
              key={entry.id}
              entry={entry}
              onSaveText={onSaveText}
              onDirtyChange={onDirtyChange}
            />
            <Separator />
            <FileMetadata entry={entry} />
          </>
        ) : (
          <EmptyState
            title={entryCount === 0 ? "No files yet" : "Select a file"}
            description={
              entryCount === 0
                ? "Create a folder or file, upload a file, or drop files here."
                : "Choose a file from the tree to preview and edit it."
            }
          />
        )}
      </CardContent>
    </Card>
  );
}
