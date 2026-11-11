import { eq } from "drizzle-orm";
import { db, todos } from "@repo/db";
import { mergeToolInput, readBoolean } from "../../utils";
import { ToolInputError, type Tool, type ToolDefinition } from "../../model";
import { resolveTodoId, toToolTodo } from "./services/todo";

const definition: ToolDefinition = {
  key: "mark_todo_done",
  name: "Mark todo done",
  description:
    "Mark a todo as done or not done. The todo can be selected by id, by find_todo output, or inferred from state.",
  category: "todo",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "number",
        description: "Optional todo id.",
      },
      done: {
        type: "boolean",
        description: "Whether the todo should be done. Defaults to true.",
        default: true,
      },
      decisionModel: {
        type: "string",
        description:
          "Optional decision model used to select the todo. Defaults to the user's default decision model.",
      },
    },
  },
  outputDescription: "The updated todo.",
  exampleConfig: { done: true },
};

export const markTodoDoneTool: Tool = {
  definition,

  async execute(context) {
    const todo = await resolveTodoId(context);
    const done = readBoolean(mergeToolInput(context), "done") ?? true;

    const [updated] = await db
      .update(todos)
      .set({ done })
      .where(eq(todos.id, todo.id))
      .returning();

    if (!updated) {
      throw new ToolInputError(`todo ${todo.id} not found`);
    }

    return {
      output: { todo: toToolTodo(updated) },
      summary: done
        ? `Marked todo "${updated.name}" as done`
        : `Marked todo "${updated.name}" as not done`,
    };
  },
};
