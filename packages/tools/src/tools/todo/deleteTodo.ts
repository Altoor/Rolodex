import { eq } from "drizzle-orm";
import { db, todos } from "@repo/db";
import { mergeToolInput, readBoolean } from "../../utils";
import { ToolInputError, type Tool, type ToolDefinition } from "../../model";
import { resolveTodoId } from "./services/todo";

const definition: ToolDefinition = {
  key: "delete_todo",
  name: "Delete todo",
  description:
    "Delete a todo. The todo can be selected by id, by find_todo output, or inferred from state.",
  category: "todo",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "number",
        description: "Optional todo id.",
      },
      decisionModel: {
        type: "string",
        description:
          "Optional decision model used to select the todo. Defaults to the user's default decision model.",
      },
      allowNotDone: {
        type: "boolean",
        description:
          "Allow deleting a todo that is not done. Defaults to false.",
        default: false,
      },
      allowNotArchived: {
        type: "boolean",
        description:
          "Allow deleting a todo that is not archived. Defaults to false.",
        default: false,
      },
    },
  },
  outputDescription: "The id and name of the deleted todo.",
  exampleConfig: {
    allowNotDone: false,
    allowNotArchived: false,
  },
};

export const deleteTodoTool: Tool = {
  definition,

  async execute(context) {
    const input = mergeToolInput(context);
    const allowNotDone = readBoolean(input, "allowNotDone") ?? false;
    const allowNotArchived = readBoolean(input, "allowNotArchived") ?? false;
    const todo = await resolveTodoId(context, { includeArchived: true });

    const done = todo.done;
    const archived = todo.archivedAt != null;

    if (!done && !archived && !allowNotDone && !allowNotArchived) {
      throw new ToolInputError(
        `todo "${todo.name}" is neither done nor archived; ` +
          `mark it done/archive it first, or set allowNotDone/allowNotArchived=true`,
      );
    }

    await db.delete(todos).where(eq(todos.id, todo.id));

    return {
      output: { id: todo.id, name: todo.name },
      summary: `Deleted todo "${todo.name}"`,
    };
  },
};
