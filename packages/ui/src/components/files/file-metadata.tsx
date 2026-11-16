import { FileQuestion } from "lucide-react";
import {
  formatBytes,
  formatDateTime,
  shortHash,
  type FileEntry,
} from "./types";

interface MetadataItemProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

function MetadataItem({ label, children, className }: MetadataItemProps) {
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
