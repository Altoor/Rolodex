"use client";

import { useQuery } from "@apollo/client/react";
import { CREATE_FILE_VIEW_TOKEN } from "@repo/queries/files/file-queries";
import { useApiOrigin } from "#lib/apiOriginContext";

export function useFileViewUrl(id: number) {
  const apiOrigin = useApiOrigin();
  const { data, loading, error, refetch } = useQuery(CREATE_FILE_VIEW_TOKEN, {
    variables: { id },
    fetchPolicy: "network-only",
  });

  const path = data?.createFileViewToken?.url;

  return {
    url: path ? `${apiOrigin}${path}` : null,
    loading,
    error,
    refetch,
  };
}

export function toDownloadUrl(url: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}download=1`;
}

/** Starts a browser download without navigating away from the page. */
export function triggerBrowserDownload(url: string, filename: string): void {
  const link = document.createElement("a");
  link.href = toDownloadUrl(url);
  link.download = filename;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  link.remove();
}
