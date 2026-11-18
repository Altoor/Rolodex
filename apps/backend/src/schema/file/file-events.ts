import { EventEmitter } from "node:events";

/**
 * In-process file-tree events. The backend is a single process, so a plain
 * EventEmitter is enough for mutations/indexing to reach the SSE subscription.
 */
export const fileEvents = new EventEmitter();
fileEvents.setMaxListeners(0);

export type FileEntryEventType = "created" | "updated" | "deleted" | "indexed";

export interface FileEntryEventPayload {
  type: FileEntryEventType;
  id: number | null;
  parentId: number | null;
  path: string | null;
  at: string;
}

export function publishFileEvent(
  event: Omit<FileEntryEventPayload, "at">,
): void {
  fileEvents.emit("fileEntry", {
    ...event,
    at: new Date().toISOString(),
  } satisfies FileEntryEventPayload);
}
