import type { FileEntryRef } from "./dto";

/**
 * Builds the streaming URL used by previews. Stage 4 replaces the bare path
 * with a signed, short-lived token; keeping the helper here means tool outputs
 * and the web client share one shape.
 */
export function buildFileViewUrl(entry: Pick<FileEntryRef, "id">): string {
  return `/files/${entry.id}/content`;
}
