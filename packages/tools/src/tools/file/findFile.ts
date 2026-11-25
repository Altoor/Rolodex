import type { Tool, ToolDefinition } from "../../model";
import { ToolNoMatchError } from "../../model";
import { mergeToolInput, readBoolean } from "../../utils";
import { withoutScore } from "./services/dto";
import { findFileMatches } from "./services/search";

const definition: ToolDefinition = {
  key: "find_file",
  name: "Find file",
  description:
    "Find one file by name/path/description using vector similarity, with lexical and decision-model fallbacks.",
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
        description: "Optional direct file id.",
      },
      path: {
        type: "string",
        description: "Optional relative path, e.g. inbox/invoice.txt.",
      },
      limit: {
        type: "number",
        description: "Number of candidates to return. Defaults to 5.",
        default: 5,
      },
      minimumScore: {
        type: "number",
        description:
          "Minimum vector similarity score (0..1) accepted without asking the decision model. Defaults to 0.",
        default: 0,
      },
      minimumConfidence: {
        type: "number",
        description:
          "Minimum decision-model confidence (0..1) required for a fallback match. Defaults to 0.",
        default: 0,
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
    "The best matching file, its similarity score, and candidate files. Appended to toolState as `{ file }`.",
  exampleConfig: {
    limit: 5,
  },
};

export const findFileTool: Tool = {
  definition,

  async execute(context) {
    const allowEmpty =
      readBoolean(mergeToolInput(context), "allowEmpty") ?? false;

    try {
      const { entry, candidates } = await findFileMatches(context, {
        kind: "file",
        limit: 5,
      });
      const file = withoutScore(entry);

      return {
        output: {
          file,
          score: entry.score,
          candidates,
          matched: true,
        },
        summary: `Found file "${entry.name}"`,
        toolStateAppend: { file, matched: true },
      };
    } catch (err) {
      if (!allowEmpty || !(err instanceof ToolNoMatchError)) throw err;

      return {
        output: {
          file: null,
          score: null,
          candidates: [],
          matched: false,
          warning: err.message,
        },
        summary: err.message,
        toolStateAppend: { file: null, matched: false },
      };
    }
  },
};
