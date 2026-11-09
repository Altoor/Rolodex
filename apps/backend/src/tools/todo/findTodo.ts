import { serializeToolOutput } from "../input";
import type { Tool, ToolDefinition } from "../types";
import { findTodoMatches } from "./search";

const definition: ToolDefinition = {
  key: "find_todo",
  name: "Find todo",
  description:
    "Find one of the user's todos by name/description using vector similarity, with lexical and decision-model fallbacks.",
  category: "todo",
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
        description: "Optional direct todo id.",
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
    "The best matching todo, its similarity score, and the candidate todos.",
  exampleConfig: {
    query: "pick up Johnny",
    limit: 5,
  },
};

export const findTodoTool: Tool = {
  definition,

  async execute(context) {
    const { todo, candidates } = await findTodoMatches(context);

    return {
      output: {
        todo: {
          id: todo.id,
          name: todo.name,
          description: todo.description,
          done: todo.done,
          doByDate: todo.doByDate,
        },
        score: todo.score,
        candidates,
      },
      summary: `Found todo "${todo.name}"`,
      // Feed the selected todo into update_todo/delete_todo. Use the
      // delimited form so existing plain-text state is preserved.
      stateAppend: serializeToolOutput({
        todoId: todo.id,
        todoName: todo.name,
      }),
      appendState: true,
    };
  },
};
