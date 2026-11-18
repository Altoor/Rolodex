"use client";

import { useState } from "react";
import { useLazyQuery } from "@apollo/client/react";
import { Download } from "lucide-react";
import { CREATE_FILE_VIEW_TOKEN } from "@repo/queries/files/file-queries";
import { Button } from "#components/ui/button";
import { FILE_API_ORIGIN } from "./file-api";
import { triggerBrowserDownload } from "./file-view";
import type { FileEntry } from "./types";

type DownloadButtonProps = React.ComponentProps<typeof Button>;

interface FileDownloadButtonProps {
  entry: Pick<FileEntry, "id" | "name">;
  label?: string;
  variant?: DownloadButtonProps["variant"];
  size?: DownloadButtonProps["size"];
  className?: string;
  iconOnly?: boolean;
}

/**
 * Fetches a short-lived signed URL on demand and starts a download. The lazy
 * query keeps the file tree from requesting a token for every visible file.
 */
export function FileDownloadButton({
  entry,
  label = "Download",
  variant = "outline",
  size = "sm",
  className,
  iconOnly = false,
}: FileDownloadButtonProps) {
  const [loadToken, { loading }] = useLazyQuery(CREATE_FILE_VIEW_TOKEN, {
    fetchPolicy: "network-only",
  });
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    setError(null);

    try {
      const result = await loadToken({ variables: { id: entry.id } });
      const path = result.data?.createFileViewToken?.url;

      if (!path) throw new Error("No download URL was returned.");

      triggerBrowserDownload(`${FILE_API_ORIGIN}${path}`, entry.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const title = error ?? `Download ${entry.name}`;

  return (
    <Button
      type="button"
      variant={error ? "destructive" : variant}
      size={size}
      className={className}
      title={title}
      aria-label={
        error ? `Download failed: ${error}` : `Download ${entry.name}`
      }
      disabled={loading}
      onClick={() => {
        void handleDownload();
      }}
    >
      <Download />
      {iconOnly ? null : loading ? "Preparing…" : error ? "Retry" : label}
    </Button>
  );
}
