import { serializeToolOutput } from "../input";
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
    },
  },
  outputDescription:
    "The best matching todos, their similarity score, and the candidate todos.",
  exampleConfig: {
    query: "pick up Johnny",
    limit: 15,
  },
};

export const findTodosTool: Tool = {
  definition,

  async execute(context) {
    const { candidates } = await findTodoMatches(context);

    return {
      output: {
        todos: candidates,
      },
      summary: `Found todos`,
      // Feed the selected todo into update_todo/delete_todo. Use the
      // delimited form so existing plain-text state is preserved.
      stateAppend: serializeToolOutput({
        todos: candidates.map((todo) => {
          return {
            todoId: todo.id,
            todoName: todo.name,
          };
        }),
      }),
      appendState: true,
    };
  },
};
