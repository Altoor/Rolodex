import type {
  FileEntryFieldsFragment,
  FileType,
} from "@repo/queries/__generated__/graphql";

export const TEXT_PREVIEW_MAX_BYTES = 5 * 1024 * 1024;

export type FileEntryKind = "file" | "folder";

export interface FileEntry {
  id: number;
  parentId: number | null;
  kind: FileEntryKind;
  name: string;
  description: string;
  path: string;
  ownerId: number | null;
  private: boolean;
  root: boolean;
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
    ownerId: fragment.ownerId ?? null,
    private: fragment.private ?? false,
    root: fragment.root ?? false,
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

function compareEntries(a: FileEntry, b: FileEntry): number {
  if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;

  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

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
