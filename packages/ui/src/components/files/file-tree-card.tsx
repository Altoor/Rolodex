import { cn } from "cn";
import { EmptyState } from "#components/feedback/empty-state";
import { LoadingState } from "#components/feedback/loading-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#components/ui/card";
import { FileTreeView } from "./file-tree-view";
import { FilesToolbar } from "./files-toolbar";
import type { FileTreeNode } from "./types";

interface FileTreeCardProps {
  tree: FileTreeNode[];
  entryCount: number;
  loading: boolean;
  selectedId: number | null;
  expandedIds: ReadonlySet<number>;
  dragOverId: number | null;
  rootDragOver: boolean;
  uploading: boolean;
  refreshing: boolean;
  onSelect: (entry: FileTreeNode) => void;
  onToggle: (id: number, open: boolean) => void;
  onDropFiles: (dataTransfer: DataTransfer, parentId: number) => void;
  onDragOverFolder: (id: number) => void;
  onDragLeaveFolder: (id: number) => void;
  onRootDragOver: () => void;
  onRootDragLeave: () => void;
  onRootDrop: (dataTransfer: DataTransfer) => void;
  onCreateFolder: () => void;
  onCreateFile: () => void;
  onUpload: (files: File[]) => void;
  onRefresh: () => void;
}

export function FileTreeCard({
  tree,
  entryCount,
  loading,
  selectedId,
  expandedIds,
  dragOverId,
  rootDragOver,
  uploading,
  refreshing,
  onSelect,
  onToggle,
  onDropFiles,
  onDragOverFolder,
  onDragLeaveFolder,
  onRootDragOver,
  onRootDragLeave,
  onRootDrop,
  onCreateFolder,
  onCreateFile,
  onUpload,
  onRefresh,
}: FileTreeCardProps) {
  return (
    <Card className="lg:sticky lg:top-4 lg:self-start">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>File tree</CardTitle>
          <FilesToolbar
            uploading={uploading}
            refreshing={refreshing}
            onCreateFolder={onCreateFolder}
            onCreateFile={onCreateFile}
            onUpload={onUpload}
            onRefresh={onRefresh}
          />
        </div>
        <CardDescription>
          Create entries, upload files, or drop files onto a folder. Refresh
          indexes the files/ directory.
        </CardDescription>
      </CardHeader>
      <CardContent
        className={cn(
          "max-h-[65vh] overflow-auto rounded-lg transition-colors",
          rootDragOver && "bg-primary/5 ring-2 ring-primary/40",
        )}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          onRootDragOver();
        }}
        onDragLeave={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
          ) {
            return;
          }
          onRootDragLeave();
        }}
        onDrop={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onRootDrop(event.dataTransfer);
        }}
      >
        {loading ? (
          <LoadingState label="Loading files…" />
        ) : entryCount === 0 ? (
          <EmptyState
            title="No files yet"
            description="Create a folder or file, upload a file, or drop files here."
          />
        ) : (
          <FileTreeView
            nodes={tree}
            selectedId={selectedId}
            expandedIds={expandedIds}
            onSelect={onSelect}
            onToggle={onToggle}
            onDropFiles={onDropFiles}
            dragOverId={dragOverId}
            onFolderDragOver={onDragOverFolder}
            onFolderDragLeave={onDragLeaveFolder}
          />
        )}
      </CardContent>
    </Card>
  );
}
