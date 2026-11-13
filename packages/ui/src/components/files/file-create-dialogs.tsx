"use client";

import { useId, useState } from "react";
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
import { Input } from "#components/ui/input";
import { Label } from "#components/ui/label";
import type { FileEntry } from "./types";

interface CreateEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: "file" | "folder";
  parentLabel: string;
  onCreate: (name: string) => Promise<void>;
}

export function CreateEntryDialog({
  open,
  onOpenChange,
  kind,
  parentLabel,
  onCreate,
}: CreateEntryDialogProps) {
  const nameId = useId();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const trimmedName = name.trim();
  const isFolder = kind === "folder";

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!trimmedName) {
      setError(new Error("A name is required."));
      return;
    }

    setSaving(true);

    try {
      await onCreate(trimmedName);
      onOpenChange(false);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isFolder ? "New folder" : "New file"}</DialogTitle>
          <DialogDescription>
            {isFolder
              ? `Create a folder in ${parentLabel}.`
              : `Create an empty plaintext file in ${parentLabel}. Use a .txt, .md, or other plaintext extension.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={nameId}>Name</Label>
            <Input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={isFolder ? "project-notes" : "notes.txt"}
              autoFocus
              disabled={saving}
            />
          </div>

          {error ? (
            <ErrorState
              title={
                isFolder ? "Could not create folder" : "Could not create file"
              }
              error={error}
            />
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
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving || !trimmedName}>
              {saving ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
