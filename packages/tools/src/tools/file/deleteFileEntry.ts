import type { Tool, ToolDefinition } from "../../model";
import { ToolInputError } from "../../model";
import { mergeToolInput, readBoolean } from "../../utils";
import { asToolInputError } from "./services/errors";
import { softDeleteFileEntryTree, type FileEntryRow } from "./services/entry";
import { resolveFileEntryRow } from "./services/search";
import { deleteEntry, listDirectory, pathExists } from "./services/storage";

const definition: ToolDefinition = {
  key: "delete_file_entry",
  name: "Delete file entry",
  description:
    "Delete a file or folder from the files tree and mark its index rows as deleted. Non-empty folders require recursive=true.",
  category: "file",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "number",
        description: "Optional direct file/folder id.",
      },
      path: {
        type: "string",
        description: "Optional relative path of the file/folder.",
      },
      recursive: {
        type: "boolean",
        description:
          "Allow deleting a non-empty folder and its contents. Defaults to false.",
        default: false,
      },
    },
  },
  outputDescription: "The deleted entry's id, kind, name, and path.",
  exampleConfig: {
    recursive: false,
  },
};

export const deleteFileEntryTool: Tool = {
  definition,

  async execute(context) {
    try {
      const input = mergeToolInput(context);
      const recursive = readBoolean(input, "recursive") ?? false;
      const row = await resolveFileEntryRow(context);

      if (row.kind === "folder" && !recursive) {
        // deleteEntry enforces this at the filesystem level, but checking the
        // index first gives a clearer message for indexed folders.
        const children = await listDirectory(row.relativePath).catch(
          (err: unknown) => {
            if (err instanceof Error && /not found/.test(err.message)) {
              return [];
            }
            throw err;
          },
        );

        if (children.length > 0) {
          throw new ToolInputError(
            `folder "${row.relativePath}" is not empty; set recursive=true to delete it`,
          );
        }
      }

      if (await pathExists(row.relativePath)) {
        await deleteEntry(row.relativePath, { recursive });
      }

      await softDeleteFileEntryTree(row.relativePath);

      return {
        output: deletedEntry(row),
        summary: `Deleted ${row.kind} "${row.relativePath}"`,
      };
    } catch (err) {
      throw asToolInputError(err);
    }
  },
};

function deletedEntry(row: FileEntryRow) {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    path: row.relativePath,
  };
}
