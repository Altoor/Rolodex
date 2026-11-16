"use client";

import { useMemo, useState } from "react";
import { getAncestors, type FileEntry } from "./types";

/** Owns the selected entry, expanded folders, and unsaved-editor guard. */
export function useFileSelection(byId: ReadonlyMap<number, FileEntry>) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(
    () => new Set<number>(),
  );
  const [dirtyEntryId, setDirtyEntryId] = useState<number | null>(null);

  const selectedEntry = selectedId === null ? undefined : byId.get(selectedId);
  const ancestors = useMemo(
    () => (selectedEntry ? getAncestors(selectedEntry.id, byId) : []),
    [byId, selectedEntry],
  );

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

  const toggleFolder = (id: number, open: boolean) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  /** Prompts before leaving an editor with unsaved changes. */
  const confirmLeaveDirty = (nextId: number | null): boolean => {
    if (dirtyEntryId === null || dirtyEntryId === nextId) return true;

    const confirmed = window.confirm("You have unsaved changes. Discard them?");

    if (confirmed) setDirtyEntryId(null);
    return confirmed;
  };

  return {
    selectedEntry,
    ancestors,
    expandedIds,
    dirtyEntryId,
    setSelectedId,
    setDirtyEntryId,
    expandAncestors,
    expandFolder,
    toggleFolder,
    confirmLeaveDirty,
  };
}
