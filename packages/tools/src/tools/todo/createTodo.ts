import { db, todos } from "@repo/db";
import {
  mergeToolInput,
  readBoolean,
  readString,
  requireNonEmptyString,
} from "../../utils";
import type { Tool, ToolDefinition } from "../../model";
import { parseTodoDateTime } from "./services/date";
import { saveTodoWithEmbedding, toToolTodo } from "./services/todo";

function readDateInput(input: Record<string, unknown>): string | undefined {
  return (
    readString(input, "doByDate") ??
    readString(input, "date") ??
    readString(input, "dueDate")
  );
}

const definition: ToolDefinition = {
  key: "create_todo",
  name: "Create todo",
  description:
    "Create a todo from explicit name, description, do-by date, and done values. Values can come from toolConfig or from an earlier tool's toolState.",
  category: "todo",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      name: {
        type: "string",
        description: "Todo name.",
      },
      description: {
        type: "string",
        description: "Todo description. Defaults to an empty string.",
      },
      doByDate: {
        type: "string",
        description:
          "Optional do-by timestamp as an ISO 8601 date-time. Empty or omitted means no due date. `date` and `dueDate` are accepted aliases.",
      },
      done: {
        type: "boolean",
        description: "Whether the todo is already done. Defaults to false.",
      },
    },
    required: ["name"],
  },
  outputDescription:
    "The created todo. Set `appendState` to append it as `todo` for later tasks.",
  exampleConfig: {
    name: "Review tax documents",
    description: "Check the receipts and file the return.",
    doByDate: "2026-11-20T17:00:00+01:00",
    done: false,
  },
};

export const createTodoTool: Tool = {
  definition,

  async execute(context) {
    const input = mergeToolInput(context);

    const name = requireNonEmptyString(
      readString(input, "name"),
      "name",
    ).trim();
    const description = readString(input, "description")?.trim() ?? "";
    const done = readBoolean(input, "done") ?? false;
    const doByDate = parseTodoDateTime(readDateInput(input));

    const [todo] = await db
      .insert(todos)
      .values({
        name,
        description,
        doByDate,
        done,
        authorId: context.userId,
        actorId: context.userId,
      })
      .returning();

    if (!todo) {
      throw new Error("failed to create todo");
    }

    await saveTodoWithEmbedding(todo);

    return {
      output: {
        todo: toToolTodo(todo),
      },
      summary: doByDate
        ? `Created todo "${name}" (due ${doByDate.toISOString()})`
        : `Created todo "${name}"`,
    };
  },
};
