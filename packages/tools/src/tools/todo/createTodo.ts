import { db, todos } from "@repo/db";
import type { Tool, ToolDefinition } from "../../model";
import { extractTodoFields } from "./services/extract-todo-fields";
import { saveTodoWithEmbedding, toToolTodo } from "./services/todo";

const definition: ToolDefinition = {
  key: "create_todo",
  name: "Create todo",
  description:
    "Create a todo. Name, description, and do-by timestamp are taken from toolConfig, JSON state, or inferred from the state with the prompt helper.",
  category: "todo",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Optional todo name.",
      },
      description: {
        type: "string",
        description: "Optional todo description.",
      },
      doByDate: {
        type: "string",
        description:
          "Optional do-by timestamp as an ISO 8601 date-time. Inferred from the request when omitted.",
      },
      model: {
        type: "string",
        description:
          "Optional generation model used to infer missing name/description/do-by fields. Defaults to the user's default generation model.",
      },
    },
  },
  outputDescription: "The created todo.",
  exampleConfig: {},
};

export const createTodoTool: Tool = {
  definition,

  async execute(context) {
    const { name, description, doByDate } = await extractTodoFields(
      context.userId,
      context,
    );

    const [todo] = await db
      .insert(todos)
      .values({
        name,
        description,
        doByDate,
        done: false,
        authorId: context.userId,
        actorId: context.userId,
      })
      .returning();

    if (!todo) {
      throw new Error("failed to create todo");
    }

    await saveTodoWithEmbedding(todo);

    return {
      output: { todo: toToolTodo(todo) },
      summary: doByDate
        ? `Created todo "${name}" (due ${doByDate.toISOString()})`
        : `Created todo "${name}"`,
    };
  },
};
