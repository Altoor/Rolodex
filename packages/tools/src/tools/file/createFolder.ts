import type { Tool, ToolDefinition } from "../../model";
import { mergeToolInput, readString, requireNonEmptyString } from "../../utils";
import { asToolInputError } from "./services/errors";
import { toFileEntryRef } from "./services/dto";
import {
  getFileEntryByPath,
  insertFileEntry,
  saveFileEntryWithEmbedding,
} from "./services/entry";
import { folderContentHash } from "./services/hash";
import { joinRelativePath, validateEntryName } from "./services/paths";
import { resolveParentFolderFromInput } from "./services/resolve";
import {
  deleteEntry,
  ensureDirectory,
  pathExists,
  statEntry,
} from "./services/storage";

const definition: ToolDefinition = {
  key: "create_folder",
  name: "Create folder",
  description:
    "Create a folder inside the files tree, optionally with a description.",
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
        description: "Folder name. No slashes.",
      },
      description: {
        type: "string",
        description: "Optional folder description.",
      },
    },
    required: ["name"],
  },
  outputDescription:
    "The created folder. Appended to toolState as `{ folder }`.",
  exampleConfig: {
    name: "inbox",
    description: "Incoming documents that still need triage.",
  },
};

export const createFolderTool: Tool = {
  definition,

  async execute(context) {
    try {
      const input = mergeToolInput(context);

      const name = validateEntryName(
        requireNonEmptyString(readString(input, "name"), "name"),
      );
      const description = readString(input, "description") ?? "";
      const parent = await resolveParentFolderFromInput(context, input);
      const parentPath = parent?.relativePath ?? "";
      const relativePath = joinRelativePath(parentPath, name);

      if (await pathExists(relativePath)) {
        throw new Error(`"${relativePath}" already exists`);
      }
      if (await getFileEntryByPath(relativePath)) {
        throw new Error(`"${relativePath}" is already indexed`);
      }

      await ensureDirectory(relativePath);
      const stat = await statEntry(relativePath);
      const now = stat?.mtime ?? new Date();

      try {
        const folder = await insertFileEntry({
          kind: "folder",
          name,
          relativePath,
          parentId: parent?.id ?? null,
          description,
          contentHash: folderContentHash([]),
          filesystemModifiedAt: now,
          lastEditedAt: now,
        });

        await saveFileEntryWithEmbedding(folder);

        const ref = toFileEntryRef(folder);

        return {
          output: { folder: ref },
          summary: `Created folder "${relativePath}"`,
          toolStateAppend: { folder: ref },
        };
      } catch (err) {
        // Keep the filesystem and DB consistent if the insert failed.
        await deleteEntry(relativePath, { recursive: false }).catch(
          () => undefined,
        );
        throw err;
      }
    } catch (err) {
      throw asToolInputError(err);
    }
  },
};
