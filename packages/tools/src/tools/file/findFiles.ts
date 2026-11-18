import type { Tool, ToolDefinition } from "../../model";
import { withoutScore } from "./services/dto";
import { findFileMatches } from "./services/search";

const definition: ToolDefinition = {
  key: "find_files",
  name: "Find files",
  description:
    "Find a list of files by name/path/description using vector similarity, with lexical and decision-model fallbacks.",
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
    "The best matching files and candidate files. Appended to toolState as `{ files: [...] }`; use filter_tool_state or a foreach output to act on individual files.",
  outputTypes: ["normal", "foreach"],
  foreachOutputDescription:
    "Enqueue one queued task per matching file, with only that file in each child's toolState.",
  exampleConfig: {
    query: "invoices",
    limit: 15,
  },
};

export const findFilesTool: Tool = {
  definition,

  async execute(context) {
    const { candidates } = await findFileMatches(context, {
      kind: "file",
      limit: 15,
    });
    const files = candidates.map(withoutScore);

    if (context.outputType === "foreach") {
      return {
        output: { files, candidates },
        summary: `Found ${files.length} files`,
        foreach: {
          items: files.map((file) => ({ file })),
        },
      };
    }

    return {
      output: { files, candidates },
      summary: `Found ${files.length} files`,
      toolStateAppend: { files },
    };
  },
};
