"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@apollo/client/react";
import { GET_FILE_TEXT } from "@repo/queries/files/file-queries";
import { ErrorState } from "#components/feedback/error-state";
import { LoadingState } from "#components/feedback/loading-state";
import { Button } from "#components/ui/button";
import { Textarea } from "#components/ui/textarea";
import type { FileEntry } from "./types";

interface FilePlaintextEditorProps {
  entry: FileEntry;
  onSave: (content: string) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

interface PlaintextDraftProps {
  entry: FileEntry;
  initialText: string;
  onSave: (content: string) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

function PlaintextDraft({
  entry,
  initialText,
  onSave,
  onDirtyChange,
}: PlaintextDraftProps) {
  const [content, setContent] = useState(initialText);
  const [savedContent, setSavedContent] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<unknown>(null);
  const dirtyChangeRef = useRef(onDirtyChange);

  useEffect(() => {
    dirtyChangeRef.current = onDirtyChange;
  });

  useEffect(
    () => () => {
      dirtyChangeRef.current?.(false);
    },
    [],
  );

  const dirty = content !== savedContent;

  useEffect(() => {
    if (!dirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const updateContent = (next: string) => {
    setContent(next);
    dirtyChangeRef.current?.(next !== savedContent);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    try {
      await onSave(content);
      setSavedContent(content);
      dirtyChangeRef.current?.(false);
    } catch (err) {
      setSaveError(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setContent(savedContent);
    setSaveError(null);
    dirtyChangeRef.current?.(false);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {dirty ? "Unsaved changes" : "Plaintext · editable"}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDiscard}
            disabled={!dirty || saving}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              void handleSave();
            }}
            disabled={!dirty || saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      <Textarea
        value={content}
        onChange={(event) => updateContent(event.target.value)}
        spellCheck={false}
        aria-label={`Contents of ${entry.name}`}
        className="min-h-[45vh] resize-y font-mono text-xs leading-relaxed"
      />

      {saveError ? (
        <ErrorState title="Could not save the file" error={saveError} />
      ) : null}
    </div>
  );
}

export function FilePlaintextEditor({
  entry,
  onSave,
  onDirtyChange,
}: FilePlaintextEditorProps) {
  const { data, loading, error, refetch } = useQuery(GET_FILE_TEXT, {
    variables: { id: entry.id },
    fetchPolicy: "cache-and-network",
  });

  const loadedText = data?.getFileText;

  if (loading && loadedText === undefined) {
    return <LoadingState label="Loading file contents…" className="min-h-32" />;
  }

  if (error && loadedText === undefined) {
    return (
      <ErrorState
        title="Could not load file contents"
        error={error}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <PlaintextDraft
      key={entry.id}
      entry={entry}
      initialText={loadedText ?? ""}
      onSave={onSave}
      onDirtyChange={onDirtyChange}
    />
  );
}
