import type { Tool, ToolDefinition } from "../../model";
import { ToolInputError } from "../../model";
import {
  mergeToolInput,
  readBoolean,
  readString,
  requireNonEmptyString,
} from "../../utils";
import { asToolInputError } from "./services/errors";
import { toFileEntryRef } from "./services/dto";
import {
  getFileEntryByPath,
  insertFileEntry,
  saveFileEntryWithEmbedding,
  updateFileEntryRow,
  type FileEntryRow,
} from "./services/entry";
import { hashFile } from "./services/hash";
import { joinRelativePath, validateEntryName } from "./services/paths";
import { resolveParentFolderFromInput } from "./services/resolve";
import {
  deleteEntry,
  pathExists,
  statEntry,
  writeTextFile,
} from "./services/storage";
import { detectFileTypeFromName } from "./services/type";

const definition: ToolDefinition = {
  key: "create_file",
  name: "Create file",
  description:
    "Create a plaintext (UTF-8) file inside the files tree. Non-plaintext extensions are rejected.",
  category: "file",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      parentId: {
        type: "number",
        description: "Parent folder id. Omit or null for the root.",
      },
      parentPath: {
        type: "string",
        description:
          "Parent folder path. Omit or use an empty string for the root.",
      },
      name: {
        type: "string",
        description:
          "File name including extension, e.g. note.txt. No slashes.",
      },
      content: {
        type: "string",
        description: "Optional UTF-8 file content.",
      },
      description: {
        type: "string",
        description: "Optional file description.",
      },
      overwrite: {
        type: "boolean",
        description:
          "Overwrite an existing file and update its index row. Defaults to false.",
        default: false,
      },
    },
    required: ["name"],
  },
  outputDescription:
    "The created or updated file. Appended to toolState as `{ file }`.",
  exampleConfig: {
    name: "note.txt",
    content: "Meeting notes…",
  },
};

export const createFileTool: Tool = {
  definition,

  async execute(context) {
    try {
      const input = mergeToolInput(context);

      const name = validateEntryName(
        requireNonEmptyString(readString(input, "name"), "name"),
      );
      const content = readString(input, "content") ?? "";
      const description = readString(input, "description");
      const overwrite = readBoolean(input, "overwrite") ?? false;

      const detected = detectFileTypeFromName(name);
      if (detected.fileType !== "plaintext") {
        throw new ToolInputError(
          `create_file supports plaintext files only; "${name}" is ${detected.fileType}`,
        );
      }

      const parent = await resolveParentFolderFromInput(context, input);
      const parentPath = parent?.relativePath ?? "";
      const relativePath = joinRelativePath(parentPath, name);

      const existingRow = await getFileEntryByPath(relativePath);
      if (existingRow?.kind === "folder") {
        throw new ToolInputError(`"${relativePath}" is a folder`);
      }

      const existsOnDisk = await pathExists(relativePath);
      if (!overwrite && (existingRow || existsOnDisk)) {
        throw new ToolInputError(`"${relativePath}" already exists`);
      }

      await writeTextFile(relativePath, content, {
        overwrite,
        createParent: false,
      });

      const stat = await statEntry(relativePath);
      if (!stat) {
        throw new Error(`file "${relativePath}" was not written`);
      }

      const contentHash = await hashFile(relativePath);
      const now = new Date();
      const nextDescription = description ?? existingRow?.description ?? "";
      const lastEditedAt = new Date(
        Math.max(
          existingRow?.lastEditedAt.getTime() ?? 0,
          stat.mtimeMs,
          now.getTime(),
        ),
      );

      let row: FileEntryRow;

      try {
        if (existingRow) {
          row = await updateFileEntryRow(existingRow.id, {
            description: nextDescription,
            fileType: detected.fileType,
            mimeType: detected.mimeType,
            size: stat.size,
            contentHash,
            filesystemModifiedAt: stat.mtime,
            lastEditedAt,
          });

          if (description !== undefined) {
            await saveFileEntryWithEmbedding(row);
          }
        } else {
          row = await insertFileEntry({
            kind: "file",
            name,
            relativePath,
            parentId: parent?.id ?? null,
            description: nextDescription,
            fileType: detected.fileType,
            mimeType: detected.mimeType,
            size: stat.size,
            contentHash,
            filesystemModifiedAt: stat.mtime,
            lastEditedAt,
          });

          await saveFileEntryWithEmbedding(row);
        }
      } catch (err) {
        if (!existingRow) {
          await deleteEntry(relativePath, { recursive: false }).catch(
            () => undefined,
          );
        }
        throw err;
      }

      const file = toFileEntryRef(row);

      return {
        output: { file },
        summary: existingRow
          ? `Overwrote file "${relativePath}"`
          : `Created file "${relativePath}"`,
        toolStateAppend: { file },
      };
    } catch (err) {
      throw asToolInputError(err);
    }
  },
};
