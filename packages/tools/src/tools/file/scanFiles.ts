import type { Tool, ToolDefinition } from "../../model";
import { ToolInputError } from "../../model";
import {
  isPlainObject,
  mergeToolInput,
  readBoolean,
  readNumber,
  readString,
} from "../../utils";
import {
  syncFileTree,
  type HashMode,
  type ScanCounts,
  type ScanEntry,
} from "./services/sync";

const definition: ToolDefinition = {
  key: "scan_files",
  name: "Scan files",
  description:
    "Reconcile the physical files/ tree with the file index, reporting added, changed, moved, deleted, and unchanged entries. Can also report only the files uploaded or attached to the current run.",
  category: "file",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      scope: {
        type: "string",
        enum: ["tree", "uploaded"],
        description:
          'Which entries to report. "tree" scans the files tree; "uploaded" returns only files uploaded with or attached to this run, including files inside attached folders. Defaults to "tree".',
        default: "tree",
      },
      path: {
        type: "string",
        description:
          "Optional subtree relative to the files root. Defaults to the whole tree.",
      },
      kind: {
        type: "string",
        enum: ["file", "folder", "all"],
        description:
          'Only include entries of this kind in the report and toolState. Defaults to "all" for normal output and "file" for foreach, so per-entry processing skips folders.',
      },
      fileType: {
        type: "string",
        enum: ["image", "text", "plaintext", "audio", "video", "other"],
        description:
          "Only include files with this detected type. Useful for flows that can only handle one kind, such as `plaintext` for read_plaintext_file.",
      },
      apply: {
        type: "boolean",
        description: "Persist changes to the database. Defaults to true.",
        default: true,
      },
      includeUnchanged: {
        type: "boolean",
        description:
          'Include unchanged entries in the report and toolState. Defaults to false; foreach output and uploaded scope default to true so every scanned entry can be processed.',
        default: false,
      },
      hash: {
        type: "string",
        enum: ["auto", "always", "never"],
        description:
          'When to compute SHA-256. "auto" trusts size+mtime for very large files. Defaults to "auto".',
        default: "auto",
      },
      detectMoves: {
        type: "boolean",
        description: "Detect moves by content hash. Defaults to true.",
        default: true,
      },
      maxEntries: {
        type: "number",
        description: "Abort above this many disk entries. Defaults to 5000.",
        default: 5000,
      },
      maxHashBytes: {
        type: "number",
        description:
          "Files larger than this are trusted by size/mtime in auto mode.",
      },
    },
  },
  outputDescription:
    'The scan report with counts, entries, and warnings. Entries are filtered by `kind` and `fileType`; counts describe the full scan. Appended to toolState as `{ changes }`; foreach yields `{ entry }` for each included entry (unchanged entries included by default). With `scope: "uploaded"`, entries and counts cover only files uploaded or attached to this run, and unchanged entries are included by default.',
  outputTypes: ["normal", "foreach"],
  foreachOutputDescription:
    "Enqueue one queued task per scanned entry, with only that entry in each child's toolState. Unchanged entries are included by default, and folders are skipped by default; set `includeUnchanged: false` to process only changes, `kind` to choose folders, `fileType` to restrict the entry type, or `scope: \"uploaded\"` to process only this run's uploads.",
  exampleConfig: {
    apply: true,
    includeUnchanged: false,
    hash: "auto",
  },
};

export const scanFilesTool: Tool = {
  definition,

  async execute(context) {
    const input = mergeToolInput(context);
    const isForeach = context.outputType === "foreach";
    const scope = readScope(input);
    const uploaded =
      scope === "uploaded" ? readUploadedPaths(context.toolState) : null;

    const report = await syncFileTree({
      path: readString(input, "path"),
      apply: readBoolean(input, "apply") ?? true,
      // A foreach run exists to process entries one by one, so unchanged
      // entries are included unless the task explicitly opts out. Otherwise a
      // scan of an already-indexed tree would silently enqueue nothing.
      // Uploaded files are already indexed, so an uploaded scope behaves the
      // same way: include them unless the task asks for changes only.
      includeUnchanged:
        readBoolean(input, "includeUnchanged") ??
        (isForeach || scope === "uploaded"),
      hash: readHashMode(input),
      detectMoves: readBoolean(input, "detectMoves") ?? true,
      maxEntries: readNumber(input, "maxEntries"),
      maxHashBytes: readNumber(input, "maxHashBytes"),
    });

    const scopedEntries = uploaded
      ? report.entries.filter((entry) => matchesUploaded(entry, uploaded))
      : report.entries;
    const changes = scopedEntries.filter(
      (entry) => entry.change !== "unchanged",
    );

    const kind = readKind(input, isForeach);
    const fileType = readFileType(input);
    const matchesFilter = (entry: (typeof report.entries)[number]) =>
      (kind === "all" || entry.kind === kind) &&
      (fileType === undefined || entry.fileType === fileType);
    const entries = scopedEntries.filter(matchesFilter);
    const filteredChanges = changes.filter(matchesFilter);

    const counts = uploaded ? countChanges(scopedEntries) : report.counts;
    const warnings =
      uploaded && uploaded.files.length === 0 && uploaded.folders.length === 0
        ? [...report.warnings, "No files were uploaded or attached to this run."]
        : report.warnings;
    const scopeLabel = scope === "uploaded" ? "uploaded files" : "files";

    const summary =
      `Scanned ${scopeLabel}: ${counts.added} added, ` +
      `${counts.changed} changed, ${counts.moved} moved, ` +
      `${counts.deleted} deleted, ${counts.unchanged} unchanged`;

    if (isForeach) {
      return {
        output: { ...report, scope, counts, entries, warnings },
        summary,
        foreach: {
          items: entries.map((entry) => ({ entry })),
        },
      };
    }

    return {
      output: { ...report, scope, counts, entries, warnings },
      summary,
      toolStateAppend: { changes: filteredChanges, counts },
    };
  },
};

type ScanScope = "tree" | "uploaded";

function readScope(input: Record<string, unknown>): ScanScope {
  const value = readString(input, "scope");

  if (value === undefined) return "tree";

  if (value !== "tree" && value !== "uploaded") {
    throw new ToolInputError('"scope" must be one of "tree" or "uploaded"');
  }

  return value;
}

interface UploadedPaths {
  files: string[];
  folders: string[];
}

/**
 * Reads the run's initial attachment entry. `createQueuedTask` marks it with
 * `uploaded: true`, so later tool outputs that also contain `files` are not
 * mistaken for this run's uploads.
 */
function readUploadedPaths(toolState: unknown[]): UploadedPaths {
  for (const entry of toolState) {
    if (!isPlainObject(entry) || entry.uploaded !== true) continue;

    return {
      files: readEntryPaths(entry.files),
      folders: readEntryPaths(entry.folders),
    };
  }

  return { files: [], folders: [] };
}

function readEntryPaths(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!isPlainObject(item)) return [];
    const path = item.path ?? item.relativePath;
    return typeof path === "string" && path.trim() ? [path] : [];
  });
}

function matchesUploaded(
  entry: ScanEntry,
  uploaded: UploadedPaths,
): boolean {
  const paths = [entry.path, entry.fromPath].filter(
    (path): path is string => typeof path === "string" && path.length > 0,
  );

  return paths.some(
    (path) =>
      uploaded.files.includes(path) ||
      uploaded.folders.some((folder) => pathIsInside(path, folder)),
  );
}

/** A direct attachment or any entry below an attached folder. */
function pathIsInside(path: string, folder: string): boolean {
  const base = folder.replace(/\/+$/, "");
  return path === base || path.startsWith(`${base}/`);
}

function countChanges(entries: ScanEntry[]): ScanCounts {
  const counts: ScanCounts = {
    added: 0,
    changed: 0,
    moved: 0,
    deleted: 0,
    unchanged: 0,
  };

  for (const entry of entries) counts[entry.change] += 1;
  return counts;
}

function readKind(
  input: Record<string, unknown>,
  isForeach: boolean,
): "file" | "folder" | "all" {
  const value = readString(input, "kind");

  if (value === undefined) return isForeach ? "file" : "all";

  if (value !== "file" && value !== "folder" && value !== "all") {
    throw new ToolInputError(
      '"kind" must be one of "file", "folder", or "all"',
    );
  }

  return value;
}

const FILE_TYPES = [
  "image",
  "text",
  "plaintext",
  "audio",
  "video",
  "other",
] as const;

function readFileType(
  input: Record<string, unknown>,
): (typeof FILE_TYPES)[number] | undefined {
  const value = readString(input, "fileType");

  if (value === undefined) return undefined;

  if (!FILE_TYPES.includes(value as (typeof FILE_TYPES)[number])) {
    throw new ToolInputError(
      `"fileType" must be one of: ${FILE_TYPES.join(", ")}`,
    );
  }

  return value as (typeof FILE_TYPES)[number];
}

function readHashMode(input: Record<string, unknown>): HashMode {
  const value = readString(input, "hash");

  if (value === undefined) return "auto";

  if (value !== "auto" && value !== "always" && value !== "never") {
    throw new ToolInputError(
      '"hash" must be one of "auto", "always", or "never"',
    );
  }

  return value;
}
