"use client";

import { AuthGate } from "../components/auth/auth-gate";
import { CreateEntryDialog } from "../components/files/create-entry-dialog";
import { DeleteEntryDialog } from "../components/files/delete-entry-dialog";
import { FilePreviewCard } from "../components/files/file-preview-card";
import { FileTaskRunner } from "../components/files/file-task-runner";
import { FileTreeCard } from "../components/files/file-tree-card";
import { useFilesPage } from "../components/files/use-files-page";
import { ErrorState } from "#components/feedback/error-state";
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
  const files = useFilesPage();

  return (
    <PageContainer>
      <PageHeader
        title="Files"
        description="Browse, edit, create, and upload files in the shared tree."
      />

      {files.liveNotice ? (
        <p className="text-xs text-muted-foreground" role="status">
          {files.liveNotice}
        </p>
      ) : null}

      {files.error ? (
        <ErrorState
          title="Could not load files"
          error={files.error}
          onRetry={() => {
            void files.refetch();
          }}
        />
      ) : null}

      {files.refreshError ? (
        <ErrorState
          title="Could not refresh the file tree"
          error={files.refreshError}
        />
      ) : null}

      {files.actionError ? (
        <ErrorState title="File operation failed" error={files.actionError} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
        <FileTreeCard
          tree={files.tree}
          entryCount={files.entries.length}
          loading={files.loadingEntries}
          selectedId={files.selectedEntry?.id ?? null}
          expandedIds={files.expandedIds}
          dragOverId={files.dragOverId}
          rootDragOver={files.rootDragOver}
          uploading={files.uploading}
          refreshing={files.refreshing}
          onSelect={files.handleSelect}
          onToggle={files.handleToggle}
          onDropFiles={files.handleDropFiles}
          onDragOverFolder={(id) => {
            files.setDragOverId(id);
            files.setRootDragOver(false);
          }}
          onDragLeaveFolder={(id) => {
            files.setDragOverId((current) => (current === id ? null : current));
          }}
          onRootDragOver={() => {
            files.setRootDragOver(true);
            files.setDragOverId(null);
          }}
          onRootDragLeave={() => files.setRootDragOver(false)}
          onRootDrop={(dataTransfer) => {
            files.setRootDragOver(false);
            files.handleDropFiles(dataTransfer, null);
          }}
          onCreateFolder={() => files.setCreateKind("folder")}
          onCreateFile={() => files.setCreateKind("file")}
          onUpload={(uploaded) => {
            void files.handleUpload(uploaded, files.targetFolderId);
          }}
          onRefresh={() => {
            void files.handleRefresh();
          }}
        />

        <FilePreviewCard
          entry={files.selectedEntry}
          ancestors={files.ancestors}
          entryCount={files.entries.length}
          loading={files.loadingEntries}
          editingMetadata={files.editingMetadata}
          onSelectFolder={files.handleBreadcrumbFolder}
          onEdit={files.startEditingMetadata}
          onCancelEdit={files.cancelEditingMetadata}
          onDelete={() => files.setDeleteOpen(true)}
          onSaveMetadata={files.handleMetadataSave}
          onSaveText={files.handleSaveText}
          onDirtyChange={files.handlePreviewDirtyChange}
        />
      </div>

      <FileTaskRunner
        parentId={files.targetFolderId}
        parentLabel={files.targetFolderLabel}
        folderIds={
          files.selectedEntry?.kind === "folder"
            ? [files.selectedEntry.id]
            : []
        }
        onUploaded={files.handleRunnerUploaded}
      />

      <CreateEntryDialog
        key={`create-${files.createKind ?? "closed"}`}
        open={files.createKind !== null}
        onOpenChange={(open) => {
          if (!open) files.setCreateKind(null);
        }}
        kind={files.createKind ?? "folder"}
        parentLabel={files.targetFolderLabel}
        onCreate={(name) =>
          files.handleCreate(files.createKind ?? "folder", name)
        }
      />

      <DeleteEntryDialog
        key={`delete-${files.deleteOpen ? "open" : "closed"}`}
        entry={files.selectedEntry ?? null}
        open={files.deleteOpen}
        onOpenChange={files.setDeleteOpen}
        onDelete={files.handleDelete}
      />
    </PageContainer>
  );
}
