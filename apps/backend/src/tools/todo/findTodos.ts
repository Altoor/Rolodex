import type { Tool, ToolDefinition } from "../types";
import { findTodoMatches } from "./search";

const definition: ToolDefinition = {
  key: "find_todos",
  name: "Find todos",
  description:
    "Find a list of the user's todos by name/description using vector similarity, with lexical and decision-model fallbacks.",
  category: "todo",
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
      includeArchived: {
        type: "boolean",
        description: "Include archived todos. Defaults to false.",
        default: false,
      },
    },
  },
  outputDescription:
    "The best matching todos, their similarity score, and the candidate todos.",
  outputTypes: ["normal", "foreach"],
  foreachOutputDescription:
    "Enqueue one queued task per matching todo, with only that todo in each child's toolState.",
  exampleConfig: {
    query: "pick up Johnny",
    limit: 15,
  },
};

export const findTodosTool: Tool = {
  definition,

  async execute(context) {
    const { candidates } = await findTodoMatches(context);

    if (context.outputType === "foreach") {
      return {
        output: { todos: candidates },
        summary: `Found ${candidates.length} todos`,
        foreach: {
          items: candidates.map((todo) => ({ todo })),
        },
      };
    }

    return {
      output: {
        todos: candidates,
      },
      summary: `Found ${candidates.length} todos`,
      toolStateAppend: { todos: candidates },
      appendState: true,
    };
  },
};
