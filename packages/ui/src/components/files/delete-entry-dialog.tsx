"use client";

import { useState } from "react";
import { ErrorState } from "#components/feedback/error-state";
import { Button } from "#components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#components/ui/dialog";
import type { FileEntry } from "./types";

interface DeleteEntryDialogProps {
  entry: FileEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => Promise<void>;
}

export function DeleteEntryDialog({
  entry,
  open,
  onOpenChange,
  onDelete,
}: DeleteEntryDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (!entry) return null;

  const isFolder = entry.kind === "folder";

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);

    try {
      await onDelete();
      onOpenChange(false);
    } catch (err) {
      setError(err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {isFolder ? "folder" : "file"}?</DialogTitle>
          <DialogDescription>
            {isFolder
              ? `This permanently deletes "${entry.name}" and everything inside it. This cannot be undone.`
              : `This permanently deletes "${entry.name}". This cannot be undone.`}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <ErrorState title="Could not delete the entry" error={error} />
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setError(null);
              onOpenChange(false);
            }}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => {
              void handleDelete();
            }}
            disabled={deleting}
          >
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
