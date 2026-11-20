import type { Tool, ToolDefinition } from "../../model";
import { mergeToolInput, readString, requireNonEmptyString } from "../../utils";
import { asToolInputError } from "./services/errors";
import { toFileEntryRef } from "./services/dto";
import { createFolderEntry } from "./services/folders";
import { resolveParentFolderFromInput } from "./services/resolve";

const definition: ToolDefinition = {
  key: "create_folder",
  name: "Create folder",
  description:
    "Create a folder inside the files tree, optionally with a description.",
  category: "file",
  usesModel: true,
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

      const name = requireNonEmptyString(readString(input, "name"), "name");
      const description = readString(input, "description") ?? "";
      const parent = await resolveParentFolderFromInput(context, input);
      const folder = await createFolderEntry({ parent, name, description });
      const ref = toFileEntryRef(folder);

      return {
        output: { folder: ref },
        summary: `Created folder "${folder.relativePath}"`,
        toolStateAppend: { folder: ref },
      };
    } catch (err) {
      throw asToolInputError(err);
    }
  },
};
