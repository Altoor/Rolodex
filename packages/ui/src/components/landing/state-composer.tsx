"use client";

import type { KeyboardEventHandler } from "react";
import { Mic, Square, Upload } from "lucide-react";
import { cn } from "cn";
import { Button } from "#components/ui/button";
import { Field, FieldDescription, FieldLabel } from "#components/ui/field";
import { Textarea } from "#components/ui/textarea";
import { useFileDrop } from "../files/use-file-drop";
import { AttachmentChips } from "./attachment-chips";

interface StateComposerProps {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>;
  disabled?: boolean;
  attachments: File[];
  recording: boolean;
  onAddFiles: (files: File[]) => void;
  onRemoveAttachment: (index: number) => void;
  onDirectoryRejected: () => void;
  onToggleRecording: () => void;
}

/**
 * The landing-page state field: a textarea that also accepts dropped files and
 * a microphone clip. Attachments are uploaded with the run, not here.
 */
export function StateComposer({
  value,
  onChange,
  onKeyDown,
  disabled,
  attachments,
  recording,
  onAddFiles,
  onRemoveAttachment,
  onDirectoryRejected,
  onToggleRecording,
}: StateComposerProps) {
  const { dragging, dropProps } = useFileDrop({
    disabled,
    onFiles: onAddFiles,
    onDirectory: onDirectoryRejected,
  });

  return (
    <Field>
      <FieldLabel htmlFor="state">State</FieldLabel>
      <div
        {...dropProps}
        className={cn(
          "relative rounded-lg transition-colors",
          dragging && "ring-2 ring-primary/50",
        )}
      >
        <Textarea
          id="state"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Describe the situation…"
          disabled={disabled}
          className="min-h-24 pr-12"
        />
        <Button
          type="button"
          variant={recording ? "destructive" : "ghost"}
          size="icon-sm"
          className="absolute right-2 bottom-2"
          aria-label={recording ? "Stop recording" : "Record audio"}
          aria-pressed={recording}
          title={recording ? "Stop recording" : "Record audio"}
          onClick={onToggleRecording}
          disabled={disabled}
        >
          {recording ? <Square /> : <Mic />}
        </Button>
        {dragging ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-background/85 text-sm font-medium">
            <Upload className="size-4" />
            Drop files to attach
          </div>
        ) : null}
      </div>

      {attachments.length > 0 ? (
        <AttachmentChips
          files={attachments}
          disabled={disabled}
          onRemove={onRemoveAttachment}
        />
      ) : null}

      <FieldDescription>
        {recording
          ? "Recording… press the stop button when you are done."
          : "Drop files or record a clip; attachments are added to the run's tool state."}
      </FieldDescription>
    </Field>
  );
}
