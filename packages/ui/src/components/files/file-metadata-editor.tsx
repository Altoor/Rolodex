"use client";

import { useId, useState } from "react";
import { ErrorState } from "#components/feedback/error-state";
import { Button } from "#components/ui/button";
import { Input } from "#components/ui/input";
import { Label } from "#components/ui/label";
import { Textarea } from "#components/ui/textarea";
import type { FileEntry } from "./types";

interface FileMetadataEditorProps {
  entry: FileEntry;
  onSave: (values: { name: string; description: string }) => Promise<void>;
  onCancel: () => void;
}

export function FileMetadataEditor({
  entry,
  onSave,
  onCancel,
}: FileMetadataEditorProps) {
  const nameId = useId();
  const descriptionId = useId();
  const [name, setName] = useState(entry.name);
  const [description, setDescription] = useState(entry.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const trimmedName = name.trim();
  const unchanged =
    trimmedName === entry.name && description === entry.description;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!trimmedName) {
      setError(new Error("A title is required."));
      return;
    }

    setSaving(true);

    try {
      await onSave({ name: trimmedName, description });
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
