"use client";

import { useQuery } from "@apollo/client/react";
import { Download, ExternalLink, FileQuestion } from "lucide-react";
import {
  CREATE_FILE_VIEW_TOKEN,
  GET_FILE_TEXT,
} from "@repo/queries/files/file-queries";
import { EmptyState } from "#components/feedback/empty-state";
import { ErrorState } from "#components/feedback/error-state";
import { LoadingState } from "#components/feedback/loading-state";
import { Button, buttonVariants } from "#components/ui/button";
import {
  formatBytes,
  formatDateTime,
  shortHash,
  type FileEntry,
} from "./types";

/**
 * The GraphQL API is served from the backend origin, while the web app runs on
 * a different port. Signed view URLs are relative to the backend.
 */
const FILE_API_ORIGIN = "http://localhost:4000";
const TEXT_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;

function useFileViewSrc(id: number) {
  const { data, loading, error, refetch } = useQuery(CREATE_FILE_VIEW_TOKEN, {
    variables: { id },
    fetchPolicy: "network-only",
  });

  const path = data?.createFileViewToken?.url;

  return {
    src: path ? `${FILE_API_ORIGIN}${path}` : null,
    loading,
    error,
    refetch,
  };
}

interface FileOpenLinkProps {
  entry: FileEntry;
  label: string;
  download?: boolean;
}

function FileOpenLink({ entry, label, download }: FileOpenLinkProps) {
  const { src, loading, error, refetch } = useFileViewSrc(entry.id);

  if (loading) {
    return (
      <Button type="button" variant="outline" size="sm" disabled>
        Preparing link…
      </Button>
    );
  }

  if (error || !src) {
    return (
      <ErrorState
        title="Could not create a file link"
        error={error ?? "No URL was returned."}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      download={download ? entry.name : undefined}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      {download ? <Download /> : <ExternalLink />}
      {label}
    </a>
  );
}

function TextPreview({ entry }: { entry: FileEntry }) {
  const { data, loading, error, refetch } = useQuery(GET_FILE_TEXT, {
    variables: { id: entry.id },
    fetchPolicy: "cache-and-network",
  });

  if (loading) {
    return <LoadingState label="Loading text preview…" className="min-h-32" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Could not load text preview"
        error={error}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const text = data?.getFileText ?? "";

  return (
    <pre className="max-h-[55vh] overflow-auto rounded-lg border bg-muted/30 p-3 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
      {text || "(empty file)"}
    </pre>
  );
}

function ImagePreview({ entry }: { entry: FileEntry }) {
  const { src, loading, error, refetch } = useFileViewSrc(entry.id);

  if (loading) {
    return <LoadingState label="Loading image preview…" className="min-h-32" />;
  }

  if (error || !src) {
    return (
      <ErrorState
        title="Could not load image preview"
        error={error ?? "No URL was returned."}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Signed URLs expire, so a plain <img> is intentional here. */}
      <img
        src={src}
        alt={entry.name}
        className="max-h-[60vh] max-w-full rounded-lg object-contain"
      />
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <ExternalLink />
        Open in new tab
      </a>
    </div>
  );
}

function AudioPreview({ entry }: { entry: FileEntry }) {
  const { src, loading, error, refetch } = useFileViewSrc(entry.id);

  if (loading) {
    return <LoadingState label="Loading audio preview…" className="min-h-32" />;
  }

  if (error || !src) {
    return (
      <ErrorState
        title="Could not load audio preview"
        error={error ?? "No URL was returned."}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <audio controls src={src} className="w-full" />
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <ExternalLink />
        Open in new tab
      </a>
    </div>
  );
}

function VideoPreview({ entry }: { entry: FileEntry }) {
  const { src, loading, error, refetch } = useFileViewSrc(entry.id);

  if (loading) {
    return <LoadingState label="Loading video preview…" className="min-h-32" />;
  }

  if (error || !src) {
    return (
      <ErrorState
        title="Could not load video preview"
        error={error ?? "No URL was returned."}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <video
        controls
        src={src}
        className="max-h-[60vh] w-full rounded-lg bg-black"
      />
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className={buttonVariants({ variant: "outline", size: "sm" })}
      >
        <ExternalLink />
        Open in new tab
      </a>
    </div>
  );
}

function OtherPreview({ entry }: { entry: FileEntry }) {
  return (
    <EmptyState
      title="No preview for this file type"
      description={
        entry.mimeType
          ? `Previewing ${entry.mimeType} files is not supported yet.`
          : "Previewing this file type is not supported yet."
      }
      action={<FileOpenLink entry={entry} label="Download" download />}
    />
  );
}

function OversizedTextPreview({ entry }: { entry: FileEntry }) {
  return (
    <EmptyState
      title="This text file is too large to preview"
      description={`The preview limit is ${formatBytes(TEXT_PREVIEW_MAX_BYTES)}. Download the file to view its full contents.`}
      action={<FileOpenLink entry={entry} label="Download" download />}
    />
  );
}

export function FilePreview({ entry }: { entry: FileEntry }) {
  if (entry.kind === "folder") {
    return (
      <EmptyState
        title="Folder selected"
        description="Select a file from the tree to preview its contents."
      />
    );
  }

  if (
    (entry.fileType === "plaintext" || entry.fileType === "text") &&
    entry.size !== null &&
    entry.size > TEXT_PREVIEW_MAX_BYTES
  ) {
    return <OversizedTextPreview entry={entry} />;
  }

  switch (entry.fileType) {
    case "plaintext":
    case "text":
      return <TextPreview entry={entry} />;
    case "image":
      return <ImagePreview entry={entry} />;
    case "audio":
      return <AudioPreview entry={entry} />;
    case "video":
      return <VideoPreview entry={entry} />;
    default:
      return <OtherPreview entry={entry} />;
  }
}

function MetadataItem({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 break-all text-sm">{children}</dd>
    </div>
  );
}

export function FileMetadata({ entry }: { entry: FileEntry }) {
  return (
    <section aria-label="File metadata" className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <FileQuestion className="size-4" />
        <h3 className="text-sm font-medium">Metadata</h3>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetadataItem label="Size">{formatBytes(entry.size)}</MetadataItem>
        <MetadataItem label="Type">
          {entry.kind}
          {entry.fileType ? ` · ${entry.fileType}` : ""}
        </MetadataItem>
        <MetadataItem label="MIME type">{entry.mimeType ?? "—"}</MetadataItem>
        <MetadataItem label="Last edited">
          {formatDateTime(entry.lastEditedAt)}
        </MetadataItem>
        <MetadataItem label="Filesystem modified">
          {formatDateTime(entry.filesystemModifiedAt)}
        </MetadataItem>
        <MetadataItem label="Content hash">
          <span title={entry.contentHash ?? undefined}>
            {shortHash(entry.contentHash)}
          </span>
        </MetadataItem>
        <MetadataItem label="Full path" className="sm:col-span-2 lg:col-span-3">
          <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {entry.path}
          </code>
        </MetadataItem>
      </dl>
    </section>
  );
}
