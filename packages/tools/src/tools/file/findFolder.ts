import type { Tool, ToolDefinition } from "../../model";
import { ToolNoMatchError } from "../../model";
import { mergeToolInput, readBoolean } from "../../utils";
import { withoutScore } from "./services/dto";
import { findFileMatches } from "./services/search";

const definition: ToolDefinition = {
  key: "find_folder",
  name: "Find folder",
  description:
    "Find one folder by name/path/description using vector similarity, with lexical and decision-model fallbacks.",
  category: "file",
  usesModel: true,
  modelRoles: ["decision", "embedding"],
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search text. Defaults to the queued task's state.",
      },
      id: {
        type: "number",
        description: "Optional direct folder id.",
      },
      path: {
        type: "string",
        description: "Optional folder path, e.g. inbox/archive.",
      },
      limit: {
        type: "number",
        description: "Number of candidates to return. Defaults to 5.",
        default: 5,
      },
      decisionModel: {
        type: "string",
        description:
          "Optional decision model used by the fallback selector. Defaults to the task/inherited decision model, then the user's default decision model.",
      },
      allowEmpty: {
        type: "boolean",
        description:
          "Return an empty result with `matched: false` instead of failing when nothing matches. Defaults to false.",
        default: false,
      },
    },
  },
  outputDescription:
    "The best matching folder, its similarity score, and candidate folders. Appended to toolState as `{ folder }`.",
  exampleConfig: {
    limit: 5,
  },
};

export const findFolderTool: Tool = {
  definition,

  async execute(context) {
    const allowEmpty =
      readBoolean(mergeToolInput(context), "allowEmpty") ?? false;

    try {
      const { entry, candidates } = await findFileMatches(context, {
        kind: "folder",
        limit: 5,
      });
      const folder = withoutScore(entry);

      return {
        output: {
          folder,
          score: entry.score,
          candidates,
          matched: true,
        },
        summary: `Found folder "${entry.name}"`,
        toolStateAppend: { folder, matched: true },
      };
    } catch (err) {
      if (!allowEmpty || !(err instanceof ToolNoMatchError)) throw err;

      return {
        output: {
          folder: null,
          score: null,
          candidates: [],
          matched: false,
          warning: err.message,
        },
        summary: err.message,
        toolStateAppend: { folder: null, matched: false },
      };
    }
  },
};
