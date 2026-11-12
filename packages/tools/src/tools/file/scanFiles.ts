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
      apply: {
        type: "boolean",
        description: "Persist changes to the database. Defaults to true.",
        default: true,
      },
      includeUnchanged: {
        type: "boolean",
        description:
          "Include unchanged entries in the report and toolState. Defaults to false.",
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
    "The scan report with counts, entries, and warnings. Appended to toolState as `{ changes }`; foreach yields `{ entry }` for each changed entry.",
  outputTypes: ["normal", "foreach"],
  foreachOutputDescription:
    "Enqueue one queued task per changed entry, with only that entry in each child's toolState.",
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

    const report = await syncFileTree({
      path: readString(input, "path"),
      apply: readBoolean(input, "apply") ?? true,
      includeUnchanged: readBoolean(input, "includeUnchanged") ?? false,
      hash: readHashMode(input),
      detectMoves: readBoolean(input, "detectMoves") ?? true,
      maxEntries: readNumber(input, "maxEntries"),
      maxHashBytes: readNumber(input, "maxHashBytes"),
    });

    const changes = report.entries.filter(
      (entry) => entry.change !== "unchanged",
    );

    const summary =
      `Scanned files: ${report.counts.added} added, ` +
      `${report.counts.changed} changed, ${report.counts.moved} moved, ` +
      `${report.counts.deleted} deleted, ${report.counts.unchanged} unchanged`;

    if (context.outputType === "foreach") {
      return {
        output: report,
        summary,
        foreach: {
          items: changes.map((entry) => ({ entry })),
        },
      };
    }

    return {
      output: report,
      summary,
      toolStateAppend: { changes, counts: report.counts },
    };
  },
};

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
