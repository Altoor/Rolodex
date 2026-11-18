import type { Tool, ToolDefinition } from "../../model";
import { ToolInputError } from "../../model";
import { mergeToolInput, readString } from "../../utils";
import { asToolInputError } from "./services/errors";
import { toFileEntryRef } from "./services/dto";
import {
  getFileEntryByPath,
  moveFileEntryTree,
  saveFileEntryWithEmbedding,
  updateFileEntryRow,
  type FileEntryRow,
} from "./services/entry";
import {
  joinRelativePath,
  parentRelativePath,
  validateEntryName,
} from "./services/paths";
import { hasInputKey, resolveParentFolderById } from "./services/resolve";
import { resolveFileEntryRow } from "./services/search";
import { moveEntry } from "./services/storage";

const definition: ToolDefinition = {
  key: "update_file_metadata",
  name: "Update file metadata",
  description:
    "Rename or move a file/folder and/or edit its description. Renaming a file or folder renames the physical entry.",
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
      name: {
        type: "string",
        description: "New basename. No slashes. Renames the physical entry.",
      },
      description: {
        type: "string",
        description: "New description, stored as database metadata only.",
      },
      parentId: {
        type: "number",
        description:
          "Move the entry into this folder id. Use null for the root.",
      },
    },
  },
  outputDescription:
    "The updated entry. Appended to toolState as `{ file }` or `{ folder }` based on its kind.",
  exampleConfig: {
    description: "Invoices received during the current tax year.",
  },
};

export const updateFileMetadataTool: Tool = {
  definition,

  async execute(context) {
    try {
      const input = mergeToolInput(context);
      const row = await resolveFileEntryRow(context);

      const name = hasInputKey(input, "name")
        ? validateEntryName(readString(input, "name") ?? "")
        : row.name;

      const description = hasInputKey(input, "description")
        ? (readString(input, "description") ?? "")
        : row.description;

      let parentId = row.parentId;
      let parentPath = parentRelativePath(row.relativePath);

      if (hasInputKey(input, "parentId")) {
        const value = input.parentId;

        if (value !== null && typeof value !== "number") {
          throw new ToolInputError('"parentId" must be a number or null');
        }

        const parent = await resolveParentFolderById(value as number | null);
        parentId = parent?.id ?? null;
        parentPath = parent?.relativePath ?? "";
      }

      const newPath = joinRelativePath(parentPath, name);

      if (
        row.kind === "folder" &&
        newPath !== row.relativePath &&
        newPath.startsWith(`${row.relativePath}/`)
      ) {
        throw new ToolInputError("a folder cannot be moved inside itself");
      }

      if (newPath !== row.relativePath) {
        const destination = await getFileEntryByPath(newPath);
        if (destination && destination.id !== row.id) {
          throw new ToolInputError(`"${newPath}" already exists`);
        }
      }

      let updatedRows: FileEntryRow[];

      if (newPath !== row.relativePath) {
        await moveEntry(row.relativePath, newPath);

        try {
          updatedRows = await moveFileEntryTree(
            row.id,
            row.relativePath,
            newPath,
            { name, parentId, description },
          );
        } catch (err) {
          // Best-effort rollback so disk and DB do not drift apart.
          await moveEntry(newPath, row.relativePath).catch(() => undefined);
          throw err;
        }

        for (const updated of updatedRows) {
          await saveFileEntryWithEmbedding(updated);
        }
      } else {
        const changed =
          name !== row.name ||
          description !== row.description ||
          parentId !== row.parentId;

        const updated = changed
          ? await updateFileEntryRow(row.id, {
              name,
              description,
              parentId,
            })
          : row;

        if (description !== row.description) {
          await saveFileEntryWithEmbedding(updated);
        }

        updatedRows = [updated];
      }

      const updatedRow =
        updatedRows.find((candidate) => candidate.id === row.id) ?? row;
      const ref = toFileEntryRef(updatedRow);

      if (updatedRow.kind === "file") {
        return {
          output: { file: ref },
          summary: `Updated file "${updatedRow.relativePath}"`,
          toolStateAppend: { file: ref },
        };
      }

      return {
        output: { folder: ref },
        summary: `Updated folder "${updatedRow.relativePath}"`,
        toolStateAppend: { folder: ref },
      };
    } catch (err) {
      throw asToolInputError(err);
    }
  },
};
