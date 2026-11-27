"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@apollo/client/react";
import { GET_FILE_ENTRIES } from "@repo/queries/files/file-queries";
import { INDEX_FILE_TREE } from "@repo/queries/files/file-mutations";
import { useFileActions } from "./file-actions";
import { useFileLiveRefresh } from "./use-file-live-refresh";
import { useFileSelection } from "./use-file-selection";
import {
  buildFileTree,
  toFileEntry,
  type FileEntry,
  type FileTreeNode,
} from "./types";

/**
 * Owns the files page data and actions. Selection, expansion, and live refresh
 * live in their own hooks; this hook composes them with the file mutations.
 */
export function useFilesPage() {
  const [refreshError, setRefreshError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [editingMetadata, setEditingMetadata] = useState(false);
  const [createKind, setCreateKind] = useState<"file" | "folder" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dragOverId, setDragOverId] = useState<number | null>(null);
  const [rootDragOver, setRootDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const { data, loading, error, refetch } = useQuery(GET_FILE_ENTRIES, {
    fetchPolicy: "cache-and-network",
  });
  const [indexFileTree, { loading: refreshing }] = useMutation(INDEX_FILE_TREE);
  const fileActions = useFileActions();
  const liveNotice = useFileLiveRefresh(refetch);

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

  const selection = useFileSelection(byId);
  const { selectedEntry, ancestors } = selection;

  // Selection is deliberately kept as-is across live refreshes; if the entry
  // disappears (deleted elsewhere) `selectedEntry` becomes undefined and the
  // page shows its normal empty selection state.
  const targetFolderId =
    selectedEntry?.kind === "folder"
      ? selectedEntry.id
      : (selectedEntry?.parentId ?? null);
  const targetFolderLabel =
    targetFolderId === null
      ? "the root folder"
      : `"${byId.get(targetFolderId)?.name ?? "folder"}"`;

  const handleSelect = (entry: FileTreeNode) => {
    if (!selection.confirmLeaveDirty(entry.id)) return;

    selection.expandAncestors(entry.id);
    selection.setSelectedId(entry.id);
    setEditingMetadata(false);
    setActionError(null);
  };

  const handleBreadcrumbFolder = (id: number | null) => {
    if (!selection.confirmLeaveDirty(id)) return;

    if (id === null) {
      selection.setSelectedId(null);
      setEditingMetadata(false);
      return;
    }

    selection.expandFolder(id);
    selection.setSelectedId(id);
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

    if (parentId !== null) selection.expandFolder(parentId);

    if (selection.confirmLeaveDirty(created.id)) {
      selection.setSelectedId(created.id);
      setEditingMetadata(false);
      setActionError(null);
    }
  };

  const handleMetadataSave = async (values: {
    name: string;
    description: string;
    private?: boolean;
    root?: boolean;
  }) => {
    if (!selectedEntry) throw new Error("No file or folder is selected.");

    const updated = await fileActions.updateEntry(selectedEntry.id, values);
    await refetch();
    selection.setSelectedId(updated.id);
    setEditingMetadata(false);
  };

  const handleDelete = async () => {
    if (!selectedEntry) return;

    await fileActions.deleteEntry(
      selectedEntry.id,
      selectedEntry.kind === "folder",
    );
    await refetch();
    selection.setSelectedId(null);
    selection.setDirtyEntryId(null);
    setEditingMetadata(false);
    setActionError(null);
  };

  const handleSaveText = async (content: string) => {
    if (!selectedEntry) throw new Error("No file is selected.");

    const updated = await fileActions.saveText(selectedEntry.id, content);
    await refetch();
    selection.setSelectedId(updated.id);
  };

  const handleUpload = async (files: File[], parentId: number | null) => {
    if (files.length === 0 || uploading) return;

    setUploading(true);
    setActionError(null);

    try {
      const uploaded = await fileActions.uploadFiles(files, parentId);
      await refetch();

      if (parentId !== null) selection.expandFolder(parentId);

      const first = uploaded[0];
      if (first && selection.confirmLeaveDirty(first.id)) {
        selection.setSelectedId(first.id);
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

    if (targetFolderId !== null) selection.expandFolder(targetFolderId);

    const first = uploaded[0];
    if (first && selection.confirmLeaveDirty(first.id)) {
      selection.setSelectedId(first.id);
      setEditingMetadata(false);
      setActionError(null);
    }
  };

  const handleDropFiles = (
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

  const handlePreviewDirtyChange = (dirty: boolean) => {
    selection.setDirtyEntryId(dirty ? (selectedEntry?.id ?? null) : null);
  };

  return {
    entries,
    tree,
    selectedEntry,
    ancestors,
    loading,
    loadingEntries: loading && entries.length === 0,
    error,
    refetch,
    liveNotice,
    refreshError,
    actionError,
    refreshing,
    uploading,
    expandedIds: selection.expandedIds,
    dragOverId,
    rootDragOver,
    editingMetadata,
    createKind,
    setCreateKind,
    deleteOpen,
    setDeleteOpen,
    targetFolderId,
    targetFolderLabel,
    handleSelect,
    handleToggle: selection.toggleFolder,
    handleBreadcrumbFolder,
    handleRefresh,
    handleCreate,
    handleMetadataSave,
    handleDelete,
    handleSaveText,
    handleUpload,
    handleRunnerUploaded,
    handleDropFiles,
    handlePreviewDirtyChange,
    startEditingMetadata: () => {
      setEditingMetadata(true);
      setActionError(null);
    },
    cancelEditingMetadata: () => setEditingMetadata(false),
    setDragOverId,
    setRootDragOver,
  };
}
