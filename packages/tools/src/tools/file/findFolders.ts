import type { Tool, ToolDefinition } from "../../model";
import { withoutScore } from "./services/dto";
import { findFileMatches } from "./services/search";

const definition: ToolDefinition = {
  key: "find_folders",
  name: "Find folders",
  description:
    "Find a list of folders by name/path/description using vector similarity, with lexical and decision-model fallbacks.",
  category: "file",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search text. Defaults to the queued task's state.",
      },
      limit: {
        type: "number",
        description: "Number of candidates to return. Defaults to 15.",
        default: 15,
      },
      decisionModel: {
        type: "string",
        description:
          "Optional decision model used by the fallback selector. Defaults to the task/inherited decision model, then the user's default decision model.",
      },
    },
  },
  outputDescription:
    "The best matching folders and candidate folders. Appended to toolState as `{ folders: [...] }`; use filter_tool_state or a foreach output to act on individual folders.",
  outputTypes: ["normal", "foreach"],
  foreachOutputDescription:
    "Enqueue one queued task per matching folder, with only that folder in each child's toolState.",
  exampleConfig: {
    query: "archive",
    limit: 15,
  },
};

export const findFoldersTool: Tool = {
  definition,

  async execute(context) {
    const { candidates } = await findFileMatches(context, {
      kind: "folder",
      limit: 15,
    });
    const folders = candidates.map(withoutScore);

    if (context.outputType === "foreach") {
      return {
        output: { folders, candidates },
        summary: `Found ${folders.length} folders`,
        foreach: {
          items: folders.map((folder) => ({ folder })),
        },
      };
    }

    return {
      output: { folders, candidates },
      summary: `Found ${folders.length} folders`,
      toolStateAppend: { folders },
    };
  },
};
