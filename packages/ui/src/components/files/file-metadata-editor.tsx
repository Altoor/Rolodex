"use client";

import { useId, useState } from "react";
import { ErrorState } from "#components/feedback/error-state";
import { Button } from "#components/ui/button";
import { Checkbox } from "#components/ui/checkbox";
import { Input } from "#components/ui/input";
import { Label } from "#components/ui/label";
import { Textarea } from "#components/ui/textarea";
import type { FileEntry } from "./types";

interface FileMetadataEditorProps {
  entry: FileEntry;
  onSave: (values: {
    name: string;
    description: string;
    private?: boolean;
    root?: boolean;
  }) => Promise<void>;
  onCancel: () => void;
}

export function FileMetadataEditor({
  entry,
  onSave,
  onCancel,
}: FileMetadataEditorProps) {
  const nameId = useId();
  const descriptionId = useId();
  const privateId = useId();
  const rootId = useId();
  const [name, setName] = useState(entry.name);
  const [description, setDescription] = useState(entry.description);
  const [isPrivate, setIsPrivate] = useState(entry.private);
  const [isRoot, setIsRoot] = useState(entry.root);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const isFolder = entry.kind === "folder";
  const trimmedName = name.trim();
  const unchanged =
    trimmedName === entry.name &&
    description === entry.description &&
    (!isFolder || (isPrivate === entry.private && isRoot === entry.root));

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!trimmedName) {
      setError(new Error("A title is required."));
      return;
    }

    setSaving(true);

    try {
      await onSave({
        name: trimmedName,
        description,
        ...(isFolder ? { private: isPrivate, root: isRoot } : {}),
      });
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={nameId}>Title</Label>
        <Input
          id={nameId}
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
          disabled={saving}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={descriptionId}>Description</Label>
        <Textarea
          id={descriptionId}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={3}
          disabled={saving}
        />
      </div>

      {isFolder ? (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <div className="flex items-start gap-2">
            <Checkbox
              id={privateId}
              checked={isPrivate}
              onCheckedChange={(checked) => setIsPrivate(checked === true)}
              disabled={saving}
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor={privateId}>Private folder</Label>
              <p className="text-xs text-muted-foreground">
                Only you can see this folder and anything inside it. Other users
                and their task flows cannot access it.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id={rootId}
              checked={isRoot}
              onCheckedChange={(checked) => setIsRoot(checked === true)}
              disabled={saving}
            />
            <div className="flex flex-col gap-0.5">
              <Label htmlFor={rootId}>Root folder</Label>
              <p className="text-xs text-muted-foreground">
                Task and flow file searches use this folder as their root and
                only search inside it. Only one folder can be the root; marking
                this one clears the previous root.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <ErrorState title="Could not save file details" error={error} />
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={saving || unchanged || !trimmedName}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
