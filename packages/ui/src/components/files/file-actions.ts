"use client";

import { useMutation } from "@apollo/client/react";
import type { FileEntryFieldsFragment } from "@repo/queries/__generated__/graphql";
import {
  CREATE_FILE_ENTRY,
  DELETE_FILE_ENTRY,
  UPDATE_FILE_ENTRY,
  WRITE_FILE_TEXT,
} from "@repo/queries/files/file-mutations";
import { authHeaders, FILE_API_ORIGIN } from "./file-api";
import { toFileEntry, type FileEntry } from "./types";

export interface CreateEntryOptions {
  parentId: number | null;
  name: string;
  description?: string;
  content?: string;
}

export interface UpdateEntryOptions {
  name?: string;
  description?: string;
  parentId?: number | null;
}

interface UploadResponse {
  file?: FileEntryFieldsFragment;
  error?: string;
}

export class FileUploadError extends Error {
  constructor(
    message: string,
    readonly uploaded: FileEntry[],
  ) {
    super(message);
    this.name = "FileUploadError";
  }
}

function requireEntry(
  fragment: FileEntryFieldsFragment | null | undefined,
): FileEntry {
  const entry = fragment ? toFileEntry(fragment) : null;
  if (!entry) {
    throw new Error("The server returned an incomplete file entry.");
  }
  return entry;
}

/** Streams one file to the backend without buffering it in memory. */
export async function uploadFileToServer(
  file: File,
  parentId: number | null,
): Promise<FileEntry> {
  const params = new URLSearchParams({ name: file.name });
  if (parentId !== null) params.set("parentId", String(parentId));

  const response = await fetch(
    `${FILE_API_ORIGIN}/files/upload?${params.toString()}`,
    {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/octet-stream",
      },
      body: file,
    },
  );

  const payload = (await response
    .json()
    .catch(() => null)) as UploadResponse | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? `Upload failed (${response.status})`);
  }

  return requireEntry(payload?.file);
}

/**
 * Uploads one request per file in parallel. Successes are returned even when a
 * later file fails, so the page can refresh and show what did land on disk.
 */
export async function uploadFilesToServer(
  files: File[],
  parentId: number | null,
): Promise<FileEntry[]> {
  const results = await Promise.allSettled(
    files.map((file) => uploadFileToServer(file, parentId)),
  );

  const uploaded = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const failures = results.flatMap((result) =>
    result.status === "rejected"
      ? [
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
        ]
      : [],
  );

  if (failures.length > 0) {
    throw new FileUploadError(
      `${failures.length} of ${files.length} upload(s) failed: ${failures.join("; ")}`,
      uploaded,
    );
  }

  return uploaded;
}

export function useFileActions() {
  const [createEntryMutation] = useMutation(CREATE_FILE_ENTRY);
  const [updateEntryMutation] = useMutation(UPDATE_FILE_ENTRY);
  const [deleteEntryMutation] = useMutation(DELETE_FILE_ENTRY);
  const [writeTextMutation] = useMutation(WRITE_FILE_TEXT);

  const createEntry = async (
    kind: "file" | "folder",
    options: CreateEntryOptions,
  ) => {
    const result = await createEntryMutation({
      variables: {
        kind,
        parentId: options.parentId,
        name: options.name,
        description: options.description,
        content: options.content,
      },
    });

    return requireEntry(result.data?.createFileEntry);
  };

  const updateEntry = async (id: number, options: UpdateEntryOptions) => {
    const result = await updateEntryMutation({
      variables: {
        id,
        name: options.name,
        description: options.description,
        parentId: options.parentId,
      },
    });

    return requireEntry(result.data?.updateFileEntry);
  };

  const deleteEntry = async (id: number, recursive = false) => {
    const result = await deleteEntryMutation({
      variables: { id, recursive },
    });

    return result.data?.deleteFileEntry ?? null;
  };

  const saveText = async (id: number, content: string) => {
    const result = await writeTextMutation({
      variables: { id, content },
    });

    return requireEntry(result.data?.writeFileText);
  };

  return {
    createFolder: (options: CreateEntryOptions) =>
      createEntry("folder", options),
    createFile: (options: CreateEntryOptions) => createEntry("file", options),
    updateEntry,
    deleteEntry,
    saveText,
    uploadFiles: uploadFilesToServer,
  };
}
