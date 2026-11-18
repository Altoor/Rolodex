import type { Tool, ToolDefinition } from "../../model";
import { withoutScore } from "./services/dto";
import { findFileMatches } from "./services/search";

const definition: ToolDefinition = {
  key: "find_file",
  name: "Find file",
  description:
    "Find one file by name/path/description using vector similarity, with lexical and decision-model fallbacks.",
  category: "file",
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
      decisionModel: {
        type: "string",
        description:
          "Optional decision model used by the fallback selector. Defaults to the task/inherited decision model, then the user's default decision model.",
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
      },
      summary: `Found file "${entry.name}"`,
      toolStateAppend: { file },
    };
  },
};
