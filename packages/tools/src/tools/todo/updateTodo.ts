import { eq } from "drizzle-orm";
import { db, todos } from "@repo/db";
import { mergeToolInput, readString } from "../../utils";
import { ToolInputError, type Tool, type ToolDefinition } from "../../model";
import {
  extractTodoDateTime,
  extractTodoFields,
} from "./services/extract-todo-fields";
import { parseTodoDateTime } from "./services/date";
import {
  resolveTodoId,
  saveTodoWithEmbedding,
  toToolTodo,
} from "./services/todo";

const definition: ToolDefinition = {
  key: "update_todo",
  name: "Update todo",
  description:
    "Update a todo's name, description, and/or do-by timestamp. The todo can be selected by id, by find_todo output, or inferred from state.",
  category: "todo",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "number",
        description: "Optional todo id.",
      },
      name: {
        type: "string",
        description: "Optional new todo name.",
      },
      description: {
        type: "string",
        description: "Optional new todo description.",
      },
      doByDate: {
        type: "string",
        description:
          "Optional new do-by timestamp as an ISO 8601 date-time. Pass an empty string to clear it. Inferred from the request when omitted.",
      },
      model: {
        type: "string",
        description:
          "Optional generation model used to infer missing name/description/do-by fields. Defaults to the user's default generation model.",
      },
      decisionModel: {
        type: "string",
        description:
          "Optional decision model used to select the todo. Defaults to the user's default decision model.",
      },
    },
  },
  outputDescription: "The updated todo.",
  exampleConfig: {},
};

export const updateTodoTool: Tool = {
  definition,

  async execute(context) {
    const todo = await resolveTodoId(context);
    const input = mergeToolInput(context);
    let name = readString(input, "name");
    let description = readString(input, "description");
    const explicitDoByDate = readString(input, "doByDate");

    const doByDate =
      explicitDoByDate !== undefined
        ? parseTodoDateTime(explicitDoByDate)
        : await extractTodoDateTime(context.userId, context);

    // Only infer replacement name/description fields when the request is not
    // a timestamp-only edit.
    if (
      (name === undefined || !name.trim()) &&
      (description === undefined || !description.trim()) &&
      doByDate === undefined
    ) {
      const extracted = await extractTodoFields(context.userId, context);
      name = extracted.name;
      description = extracted.description;
    }

    const [updated] = await db
      .update(todos)
      .set({
        name: name?.trim() ? name : todo.name,
        description: description?.trim() ? description : todo.description,
        ...(doByDate !== undefined ? { doByDate } : {}),
      })
      .where(eq(todos.id, todo.id))
      .returning();

    if (!updated) {
      throw new ToolInputError(`todo ${todo.id} not found`);
    }

    if (name !== undefined || description !== undefined) {
      await saveTodoWithEmbedding(updated);
    }

    return {
      output: { todo: toToolTodo(updated) },
      summary: doByDate
        ? `Updated todo "${updated.name}" (due ${doByDate.toISOString()})`
        : `Updated todo "${updated.name}"`,
    };
  },
};
