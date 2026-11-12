import type {
  FileEntryFieldsFragment,
  FileType,
} from "@repo/queries/__generated__/graphql";

export type FileEntryKind = "file" | "folder";

export interface FileEntry {
  id: number;
  parentId: number | null;
  kind: FileEntryKind;
  name: string;
  description: string;
  path: string;
  fileType: FileType | null;
  mimeType: string | null;
  size: number | null;
  contentHash: string | null;
  lastEditedAt: unknown;
  filesystemModifiedAt: unknown;
  createdAt: unknown;
  updatedAt: unknown;
  deletedAt: unknown;
}

export interface FileTreeNode extends FileEntry {
  children: FileTreeNode[];
}

/**
 * Converts the nullable generated fragment into a fully-populated entry. The
 * server always returns these fields, but the generated types keep them
 * nullable because of how the schema is exposed.
 */
export function toFileEntry(
  fragment: FileEntryFieldsFragment,
): FileEntry | null {
  if (
    fragment.id === null ||
    fragment.kind === null ||
    fragment.name === null ||
    fragment.path === null
  ) {
    return null;
  }

  return {
    id: fragment.id,
    parentId: fragment.parentId,
    kind: fragment.kind,
    name: fragment.name,
    description: fragment.description ?? "",
    path: fragment.path,
    fileType: fragment.fileType,
    mimeType: fragment.mimeType,
    size: fragment.size,
    contentHash: fragment.contentHash,
    lastEditedAt: fragment.lastEditedAt,
    filesystemModifiedAt: fragment.filesystemModifiedAt,
    createdAt: fragment.createdAt,
    updatedAt: fragment.updatedAt,
    deletedAt: fragment.deletedAt,
  };
}

const compareEntries = (a: FileEntry, b: FileEntry): number => {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;

  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

/** Builds a nested tree from the flat `fileEntries` response. */
export function buildFileTree(entries: FileEntry[]): FileTreeNode[] {
  const nodes = new Map<number, FileTreeNode>();

  for (const entry of entries) {
    nodes.set(entry.id, { ...entry, children: [] });
  }

  const roots: FileTreeNode[] = [];

  for (const node of nodes.values()) {
    const parent =
      node.parentId === null ? undefined : nodes.get(node.parentId);

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const node of nodes.values()) {
    node.children.sort(compareEntries);
  }
  roots.sort(compareEntries);

  return roots;
}

/** Returns the folder chain from the root down to (but not including) `id`. */
export function getAncestors(
  id: number,
  byId: ReadonlyMap<number, FileEntry>,
): FileEntry[] {
  const ancestors: FileEntry[] = [];
  const visited = new Set<number>();
  let current = byId.get(id);

  while (current?.parentId !== null && current?.parentId !== undefined) {
    if (visited.has(current.parentId)) break;
    visited.add(current.parentId);

    const parent = byId.get(current.parentId);
    if (!parent) break;

    ancestors.unshift(parent);
    current = parent;
  }

  return ancestors;
}

export function formatBytes(size: number | null): string {
  if (size === null || Number.isNaN(size)) return "—";
  if (size < 1024) return `${size} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function formatDateTime(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";

  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString();
}

export function shortHash(hash: string | null): string {
  if (!hash) return "—";
  return hash.length > 16 ? `${hash.slice(0, 16)}…` : hash;
}

export function fileTypeLabel(fileType: FileType | null): string {
  if (!fileType) return "unknown";
  return fileType;
}
