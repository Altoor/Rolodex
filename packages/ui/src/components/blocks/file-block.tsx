"use client";

import { useState } from "react";
import {
  File as FileGlyph,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Folder,
} from "lucide-react";
import { Button } from "#components/ui/button";
import { FileDownloadButton } from "../files/file-download-button";
import { FilePreview } from "../files/file-preview";
import { formatBytes, type FileEntry } from "../files/types";
import type { BlockComponentProps, BlockDefinition } from "./types";

const FILE_TYPES = new Set(["image", "text", "plaintext", "audio", "video", "other"]);

interface RawFileEntry {
  id: number | null;
  kind: "file" | "folder";
  name: string;
  description: string;
  path: string;
  parentId: number | null;
  fileType: string | null;
  mimeType: string | null;
  size: number | null;
  contentHash: string | null;
  lastEditedAt: unknown;
  filesystemModifiedAt: unknown;
  createdAt: unknown;
  updatedAt: unknown;
  deletedAt: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recognises the shared `FileEntryRef` shape emitted by every file tool. */
function toRawFile(value: unknown): RawFileEntry | null {
  if (!isRecord(value)) return null;
  if (value.kind !== "file" && value.kind !== "folder") return null;
  if (typeof value.name !== "string" || typeof value.path !== "string") {
    return null;
  }

  return {
    id:
      typeof value.id === "number" && Number.isInteger(value.id)
        ? value.id
        : null,
    kind: value.kind,
    name: value.name,
    description:
      typeof value.description === "string" ? value.description : "",
    path: value.path,
    parentId: typeof value.parentId === "number" ? value.parentId : null,
    fileType: typeof value.fileType === "string" ? value.fileType : null,
    mimeType: typeof value.mimeType === "string" ? value.mimeType : null,
    size: typeof value.size === "number" ? value.size : null,
    contentHash:
      typeof value.contentHash === "string" ? value.contentHash : null,
    lastEditedAt: value.lastEditedAt ?? null,
    filesystemModifiedAt: value.filesystemModifiedAt ?? null,
    createdAt: value.createdAt ?? null,
    updatedAt: value.updatedAt ?? null,
    deletedAt: value.deletedAt ?? null,
  };
}

function extractFiles(
  value: unknown,
  output: RawFileEntry[],
  seen: Set<string>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) extractFiles(item, output, seen);
    return;
  }

  if (!isRecord(value)) return;

  const file = toRawFile(value);
  if (file) {
    const key = file.id !== null ? `id:${file.id}` : `path:${file.path}`;
    if (!seen.has(key)) {
      seen.add(key);
      output.push(file);
    }
  }

  for (const child of Object.values(value)) {
    extractFiles(child, output, seen);
  }
}

export function extractBlockFiles(output: unknown): RawFileEntry[] {
  const files: RawFileEntry[] = [];
  extractFiles(output, files, new Set());
  return files;
}

function FileIcon({ file }: { file: RawFileEntry }) {
  if (file.kind === "folder") return <Folder className="size-4" />;

  switch (file.fileType) {
    case "image":
      return <FileImage className="size-4" />;
    case "audio":
      return <FileAudio className="size-4" />;
    case "video":
      return <FileVideo className="size-4" />;
    case "plaintext":
    case "text":
      return <FileText className="size-4" />;
    default:
      return <FileGlyph className="size-4" />;
  }
}

/** Converts a tool file ref into the files page's entry shape for preview. */
function toPreviewEntry(file: RawFileEntry): FileEntry | null {
  if (file.id === null || file.kind !== "file") return null;

  return {
    id: file.id,
    parentId: file.parentId,
    kind: file.kind,
    name: file.name,
    description: file.description,
    path: file.path,
    fileType:
      file.fileType !== null && FILE_TYPES.has(file.fileType)
        ? (file.fileType as FileEntry["fileType"])
        : null,
    mimeType: file.mimeType,
    size: file.size,
    contentHash: file.contentHash,
    lastEditedAt: file.lastEditedAt,
    filesystemModifiedAt: file.filesystemModifiedAt,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
    deletedAt: file.deletedAt,
  };
}

function FileCard({ file }: { file: RawFileEntry }) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const previewEntry = toPreviewEntry(file);

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-muted-foreground">
            <FileIcon file={file} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <code className="block truncate text-xs text-muted-foreground">
              {file.path}
            </code>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1">
          {previewEntry ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={previewOpen}
              onClick={() => setPreviewOpen((open) => !open)}
            >
              {previewOpen ? "Hide preview" : "Preview"}
            </Button>
          ) : null}
          {file.id !== null ? (
            <FileDownloadButton entry={{ id: file.id, name: file.name }} />
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {file.kind}
        {file.fileType ? ` · ${file.fileType}` : ""}
        {file.mimeType ? ` · ${file.mimeType}` : ""}
        {file.size !== null ? ` · ${formatBytes(file.size)}` : ""}
      </p>

      {file.description ? (
        <p className="text-sm">{file.description}</p>
      ) : null}

      {previewOpen && previewEntry ? (
        <div className="border-t pt-3">
          <FilePreview entry={previewEntry} />
        </div>
      ) : null}
    </div>
  );
}

function FileBlock({ output }: BlockComponentProps) {
  const files = extractBlockFiles(output);

  if (files.length === 0) {
    return <p className="text-xs text-muted-foreground">No files to display.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {files.map((file) => (
        <FileCard key={file.id !== null ? `id:${file.id}` : file.path} file={file} />
      ))}
    </div>
  );
}

export const fileBlock: BlockDefinition = {
  id: "file",
  match: ({ output }) => extractBlockFiles(output).length > 0,
  Component: FileBlock,
};
