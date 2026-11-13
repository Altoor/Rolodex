"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useSubscription } from "@apollo/client/react";
import { FilePlus, FolderPlus, RefreshCw, Upload } from "lucide-react";
import { cn } from "cn";
import {
  GET_FILE_ENTRIES,
} from "@repo/queries/files/file-queries";
import { FILE_ENTRY_EVENT } from "@repo/queries/files/file-subscriptions";
import { INDEX_FILE_TREE } from "@repo/queries/files/file-mutations";
import { AuthGate } from "../components/auth/auth-gate";
import {
  CreateEntryDialog,
  DeleteEntryDialog,
} from "../components/files/file-create-dialogs";
import { useFileActions } from "../components/files/file-actions";
import { FileMetadataEditor } from "../components/files/file-metadata-editor";
import { FileMetadata, FilePreview } from "../components/files/file-preview";
import { FilePreviewHeader } from "../components/files/file-preview-header";
import { FileTaskRunner } from "../components/files/file-task-runner";
import { FileTreeView } from "../components/files/file-tree-view";
import {
  buildFileTree,
  getAncestors,
  toFileEntry,
  type FileEntry,
  type FileTreeNode,
} from "../components/files/types";
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
  const [actionError, setActionError] = useState<unknown>(null);
  const [editingMetadata, setEditingMetadata] = useState(false);
  const [createKind, setCreateKind] = useState<"file" | "folder" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dirtyEntryId, setDirtyEntryId] = useState<number | null>(null);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [liveNotice, setLiveNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, loading, error, refetch } = useQuery(GET_FILE_ENTRIES, {
    fetchPolicy: "cache-and-network",
  });
  const [indexFileTree, { loading: refreshing }] = useMutation(INDEX_FILE_TREE);
  const fileActions = useFileActions();

  // File mutations and indexing run in the backend process, so the tree is
  // refreshed from a subscription instead of polling. Coalesce bursts (an
  // upload or folder indexing emits one event per file).
  useSubscription(FILE_ENTRY_EVENT, {
    onData: ({ data: subscriptionData }) => {
      const event = subscriptionData.data?.fileEntryEvent;
      if (!event) return;

      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      refetchTimerRef.current = setTimeout(() => {
        refetchTimerRef.current = null;
        void refetch();
      }, 250);

      setLiveNotice(
        event.type === "indexed"
          ? "File tree updated after indexing."
          : "Files updated live.",
      );

      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => {
        noticeTimerRef.current = null;
        setLiveNotice(null);
      }, 4000);
    },
  });

  useEffect(
    () => () => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    },
    [],
  );

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

  // Selection is deliberately kept as-is across live refreshes; if the entry
  // disappears (deleted elsewhere) `selectedEntry` becomes undefined and the
  // page shows its normal empty selection state.

  const selectedEntry = selectedId === null ? undefined : byId.get(selectedId);
  const ancestors = selectedEntry ? getAncestors(selectedEntry.id, byId) : [];

  const targetFolderId =
    selectedEntry?.kind === "folder"
      ? selectedEntry.id
      : (selectedEntry?.parentId ?? null);
  const targetFolderLabel =
    targetFolderId === null
      ? "the root folder"
      : `"${byId.get(targetFolderId)?.name ?? "folder"}"`;

  const expandAncestors = (id: number) => {
    const ancestorIds = getAncestors(id, byId).map((entry) => entry.id);

    setExpandedIds((current) => {
      const next = new Set(current);
      for (const ancestorId of ancestorIds) next.add(ancestorId);
      return next;
    });
  };

  const expandFolder = (id: number) => {
    const ancestorIds = getAncestors(id, byId).map((entry) => entry.id);

    setExpandedIds((current) => {
      const next = new Set(current);
      for (const ancestorId of ancestorIds) next.add(ancestorId);
      next.add(id);
      return next;
    });
  };

  const canLeaveDirtyEntry = (nextId: number | null) => {
    if (dirtyEntryId === null || dirtyEntryId === nextId) return true;

    const confirmed = window.confirm("You have unsaved changes. Discard them?");

    if (confirmed) setDirtyEntryId(null);
    return confirmed;
  };

  const handleSelect = (entry: FileTreeNode) => {
    if (!canLeaveDirtyEntry(entry.id)) return;

    expandAncestors(entry.id);
    setSelectedId(entry.id);
    setEditingMetadata(false);
    setActionError(null);
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
    if (!canLeaveDirtyEntry(id)) return;

    if (id === null) {
      setSelectedId(null);
      setEditingMetadata(false);
      return;
    }

    expandFolder(id);
    setSelectedId(id);
    setEditingMetadata(false);
    setActionError(null);
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

  const handleCreate = async (kind: "file" | "folder", name: string) => {
    const parentId = targetFolderId;
    const created =
      kind === "folder"
        ? await fileActions.createFolder({ parentId, name })
        : await fileActions.createFile({ parentId, name, content: "" });

    await refetch();

    if (parentId !== null) expandFolder(parentId);

    if (canLeaveDirtyEntry(created.id)) {
      setSelectedId(created.id);
      setEditingMetadata(false);
      setActionError(null);
    }
  };

  const handleMetadataSave = async (values: {
    name: string;
    description: string;
  }) => {
    if (!selectedEntry) throw new Error("No file or folder is selected.");

    const updated = await fileActions.updateEntry(selectedEntry.id, values);
    await refetch();
    setSelectedId(updated.id);
    setEditingMetadata(false);
  };

  const handleDelete = async () => {
    if (!selectedEntry) return;

    await fileActions.deleteEntry(
      selectedEntry.id,
      selectedEntry.kind === "folder",
    );
    await refetch();
    setSelectedId(null);
    setEditingMetadata(false);
    setDirtyEntryId(null);
    setActionError(null);
  };

  const handleSaveText = async (content: string) => {
    if (!selectedEntry) throw new Error("No file is selected.");

    const updated = await fileActions.saveText(selectedEntry.id, content);
    await refetch();
    setSelectedId(updated.id);
  };

  const handleUpload = async (files: File[], parentId: number | null) => {
    if (files.length === 0 || uploading) return;

    setUploading(true);
    setActionError(null);

    try {
      const uploaded = await fileActions.uploadFiles(files, parentId);
      await refetch();

      if (parentId !== null) expandFolder(parentId);

      const first = uploaded[0];
      if (first && canLeaveDirtyEntry(first.id)) {
        setSelectedId(first.id);
        setEditingMetadata(false);
      }
    } catch (err) {
      // Some files may have landed before an error; refresh before showing it.
      await refetch().catch(() => undefined);
      setActionError(err);
    } finally {
      setUploading(false);
      setDragOverId(null);
      setRootDragOver(false);
    }
  };

  const handleRunnerUploaded = async (uploaded: FileEntry[]) => {
    await refetch();

    if (targetFolderId !== null) expandFolder(targetFolderId);

    const first = uploaded[0];
    if (first && canLeaveDirtyEntry(first.id)) {
      setSelectedId(first.id);
      setEditingMetadata(false);
      setActionError(null);
    }
  };

  const handleDropData = (
    dataTransfer: DataTransfer,
    parentId: number | null,
  ) => {
    const items = Array.from(dataTransfer.items);
    const hasDirectory = items.some((item) => {
      const entry = item.webkitGetAsEntry?.();
      return entry?.isDirectory === true;
    });

    if (hasDirectory) {
      setActionError(
        new Error("Folder upload is not supported yet. Drop files instead."),
      );
      return;
    }

    const files = Array.from(dataTransfer.files);
    if (files.length > 0) void handleUpload(files, parentId);
  };

  const loadingEntries = loading && entries.length === 0;

  return (
    <PageContainer>
      <PageHeader
        title="Files"
        description="Browse, edit, create, and upload files in the shared tree."
      />

      {liveNotice ? (
        <p className="text-xs text-muted-foreground" role="status">
          {liveNotice}
        </p>
      ) : null}

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

      {actionError ? (
        <ErrorState title="File operation failed" error={actionError} />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
        <Card className="lg:sticky lg:top-4 lg:self-start">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>File tree</CardTitle>
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCreateKind("folder")}
                >
                  <FolderPlus />
                  New folder
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCreateKind("file")}
                >
                  <FilePlus />
                  New file
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? <Spinner className="size-3.5" /> : <Upload />}
                  {uploading ? "Uploading…" : "Upload"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void handleRefresh();
                  }}
                  disabled={refreshing}
                >
                  {refreshing ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <RefreshCw />
                  )}
                  {refreshing ? "Refreshing…" : "Refresh"}
                </Button>
              </div>
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
              setRootDragOver(true);
              setDragOverId(null);
            }}
            onDragLeave={(event) => {
              if (
                event.relatedTarget instanceof Node &&
                event.currentTarget.contains(event.relatedTarget)
              ) {
                return;
              }
              setRootDragOver(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setRootDragOver(false);
              handleDropData(event.dataTransfer, null);
            }}
          >
            {loadingEntries ? (
              <LoadingState label="Loading files…" />
            ) : entries.length === 0 ? (
              <EmptyState
                title="No files yet"
                description="Create a folder or file, upload a file, or drop files here."
              />
            ) : (
              <FileTreeView
                nodes={tree}
                selectedId={selectedEntry?.id ?? null}
                expandedIds={expandedIds}
                onSelect={handleSelect}
                onToggle={handleToggle}
                onDropFiles={handleDropData}
                dragOverId={dragOverId}
                onFolderDragOver={(id) => {
                  setDragOverId(id);
                  setRootDragOver(false);
                }}
                onFolderDragLeave={(id) => {
                  setDragOverId((current) => (current === id ? null : current));
                }}
              />
            )}

            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length > 0) {
                  void handleUpload(files, targetFolderId);
                }
              }}
            />
          </CardContent>
        </Card>

        <Card className="min-h-[28rem]">
          <CardContent className="flex flex-col gap-4">
            {loadingEntries ? (
              <LoadingState label="Loading files…" />
            ) : selectedEntry ? (
              <>
                {editingMetadata ? (
                  <FileMetadataEditor
                    entry={selectedEntry}
                    onSave={handleMetadataSave}
                    onCancel={() => setEditingMetadata(false)}
                  />
                ) : (
                  <FilePreviewHeader
                    entry={selectedEntry}
                    ancestors={ancestors}
                    onSelectFolder={handleBreadcrumbFolder}
                    onEdit={() => {
                      setEditingMetadata(true);
                      setActionError(null);
                    }}
                    onDelete={() => setDeleteOpen(true)}
                  />
                )}
                <Separator />
                <FilePreview
                  key={selectedEntry.id}
                  entry={selectedEntry}
                  onSaveText={handleSaveText}
                  onDirtyChange={(dirty) =>
                    setDirtyEntryId(dirty ? selectedEntry.id : null)
                  }
                />
                <Separator />
                <FileMetadata entry={selectedEntry} />
              </>
            ) : (
              <EmptyState
                title={entries.length === 0 ? "No files yet" : "Select a file"}
                description={
                  entries.length === 0
                    ? "Create a folder or file, upload a file, or drop files here."
                    : "Choose a file from the tree to preview and edit it."
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      <FileTaskRunner
        parentId={targetFolderId}
        parentLabel={targetFolderLabel}
        folderIds={selectedEntry?.kind === "folder" ? [selectedEntry.id] : []}
        onUploaded={handleRunnerUploaded}
      />

      <CreateEntryDialog
        key={`create-${createKind ?? "closed"}`}
        open={createKind !== null}
        onOpenChange={(open) => {
          if (!open) setCreateKind(null);
        }}
        kind={createKind ?? "folder"}
        parentLabel={targetFolderLabel}
        onCreate={(name) => handleCreate(createKind ?? "folder", name)}
      />

      <DeleteEntryDialog
        key={`delete-${deleteOpen ? "open" : "closed"}`}
        entry={selectedEntry ?? null}
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDelete={handleDelete}
      />
    </PageContainer>
  );
}
