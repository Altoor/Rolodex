import type { Tool, ToolDefinition } from "../../model";
import { ToolInputError } from "../../model";
import {
  mergeToolInput,
  readBoolean,
  readNumber,
  readString,
} from "../../utils";
import { syncFileTree, type HashMode } from "./services/sync";

const definition: ToolDefinition = {
  key: "scan_files",
  name: "Scan files",
  description:
    "Reconcile the physical files/ tree with the file index, reporting added, changed, moved, deleted, and unchanged entries.",
  category: "file",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
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
          "Include unchanged entries in the report and toolState. Defaults to false; foreach output defaults to true so every scanned entry can be processed.",
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
    "The scan report with counts, entries, and warnings. Entries are filtered by `kind` and `fileType`; counts describe the full scan. Appended to toolState as `{ changes }`; foreach yields `{ entry }` for each included entry (unchanged entries included by default).",
  outputTypes: ["normal", "foreach"],
  foreachOutputDescription:
    "Enqueue one queued task per scanned entry, with only that entry in each child's toolState. Unchanged entries are included by default, and folders are skipped by default; set `includeUnchanged: false` to process only changes, `kind` to choose folders, or `fileType` to restrict the entry type.",
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

    const report = await syncFileTree({
      path: readString(input, "path"),
      apply: readBoolean(input, "apply") ?? true,
      // A foreach run exists to process entries one by one, so unchanged
      // entries are included unless the task explicitly opts out. Otherwise a
      // scan of an already-indexed tree would silently enqueue nothing.
      includeUnchanged: readBoolean(input, "includeUnchanged") ?? isForeach,
      hash: readHashMode(input),
      detectMoves: readBoolean(input, "detectMoves") ?? true,
      maxEntries: readNumber(input, "maxEntries"),
      maxHashBytes: readNumber(input, "maxHashBytes"),
    });

    const changes = report.entries.filter(
      (entry) => entry.change !== "unchanged",
    );

    const kind = readKind(input, isForeach);
    const fileType = readFileType(input);
    const matchesFilter = (entry: (typeof report.entries)[number]) =>
      (kind === "all" || entry.kind === kind) &&
      (fileType === undefined || entry.fileType === fileType);
    const entries = report.entries.filter(matchesFilter);
    const filteredChanges = changes.filter(matchesFilter);

    const summary =
      `Scanned files: ${report.counts.added} added, ` +
      `${report.counts.changed} changed, ${report.counts.moved} moved, ` +
      `${report.counts.deleted} deleted, ${report.counts.unchanged} unchanged`;

    if (isForeach) {
      return {
        output: { ...report, entries },
        summary,
        foreach: {
          items: entries.map((entry) => ({ entry })),
        },
      };
    }

    return {
      output: { ...report, entries },
      summary,
      toolStateAppend: { changes: filteredChanges, counts: report.counts },
    };
  },
};

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
