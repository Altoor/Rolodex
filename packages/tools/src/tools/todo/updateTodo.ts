import { eq } from "drizzle-orm";
import { db, todos } from "@repo/db";
import { mergeToolInput, readBoolean, readString } from "../../utils";
import { ToolInputError, type Tool, type ToolDefinition } from "../../model";
import { parseTodoDateTime } from "./services/date";
import {
  resolveTodoId,
  saveTodoWithEmbedding,
  toToolTodo,
} from "./services/todo";

function readDateInput(input: Record<string, unknown>): string | undefined {
  return (
    readString(input, "doByDate") ??
    readString(input, "date") ??
    readString(input, "dueDate")
  );
}

const definition: ToolDefinition = {
  key: "update_todo",
  name: "Update todo",
  description:
    "Update a todo from explicit name, description, do-by date, and done values. Only provided fields change.",
  category: "todo",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "number",
        description:
          "Todo id. Can be supplied here or by a find_todo task in toolState.",
      },
      name: {
        type: "string",
        description: "New todo name. Omit to keep the current name.",
      },
      description: {
        type: "string",
        description:
          "New todo description. Omit to keep the current description; use an empty string to clear it.",
      },
      doByDate: {
        type: "string",
        description:
          "New do-by timestamp as an ISO 8601 date-time. Omit to keep the current value; use an empty string to clear it. `date` and `dueDate` are accepted aliases.",
      },
      done: {
        type: "boolean",
        description: "New done flag. Omit to keep the current value.",
      },
      decisionModel: {
        type: "string",
        description:
          "Optional decision model used to select the todo when no id is supplied. Defaults to the user's default decision model.",
      },
    },
  },
  outputDescription:
    "The updated todo. Set `appendState` to append it as `todo` for later tasks.",
  exampleConfig: {
    description: "Updated description.",
    done: false,
  },
};

export const updateTodoTool: Tool = {
  definition,

  async execute(context) {
    const todo = await resolveTodoId(context);
    const input = mergeToolInput(context);

    const suppliedName = readString(input, "name");
    if (suppliedName !== undefined && !suppliedName.trim()) {
      throw new ToolInputError(`"name" cannot be empty`);
    }

    const name = suppliedName?.trim();
    const description = readString(input, "description")?.trim();
    const dateInput = readDateInput(input);
    const doByDate =
      dateInput !== undefined ? parseTodoDateTime(dateInput) : undefined;
    const done = readBoolean(input, "done");

    if (
      name === undefined &&
      description === undefined &&
      doByDate === undefined &&
      done === undefined
    ) {
      throw new ToolInputError(
        "update_todo requires at least one of name, description, doByDate, or done",
      );
    }

    const [updated] = await db
      .update(todos)
      .set({
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(doByDate !== undefined ? { doByDate } : {}),
        ...(done !== undefined ? { done } : {}),
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
      summary: `Updated todo "${updated.name}"`,
    };
  },
};
