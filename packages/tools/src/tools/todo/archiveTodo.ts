import { eq } from "drizzle-orm";
import { db, todos } from "@repo/db";
import { mergeToolInput, readBoolean } from "../../utils";
import {
  ToolInputError,
  type Tool,
  type ToolDefinition,
} from "../../model";
import { resolveTodoId, toToolTodo } from "./todos";

const definition: ToolDefinition = {
  key: "archive_todo",
  name: "Archive todo",
  description:
    "Archive or restore a todo. The todo can be selected by id, by find_todo output, or inferred from state.",
  category: "todo",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "number",
        description: "Optional todo id.",
      },
      archived: {
        type: "boolean",
        description: "True archives the todo, false restores it.",
        default: true,
      },
      decisionModel: {
        type: "string",
        description:
          "Optional decision model used to select the todo. Defaults to the user's default decision model.",
      },
    },
  },
  outputDescription: "The archived or restored todo.",
  exampleConfig: { id: 3, archived: true },
};

export const archiveTodoTool: Tool = {
  definition,

  async execute(context) {
    const archived = readBoolean(mergeToolInput(context), "archived") ?? true;
    const todo = await resolveTodoId(context, { includeArchived: true });

    const [updated] = await db
      .update(todos)
      .set({ archivedAt: archived ? new Date() : null })
      .where(eq(todos.id, todo.id))
      .returning();

    if (!updated) {
      throw new ToolInputError(`todo ${todo.id} not found`);
    }

    return {
      output: { todo: toToolTodo(updated) },
      summary: archived
        ? `Archived todo "${updated.name}"`
        : `Restored todo "${updated.name}"`,
    };
  },
};
