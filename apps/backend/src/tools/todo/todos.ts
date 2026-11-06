import { eq } from "drizzle-orm";
import { db } from "../../schema/builder";
import { todos } from "../../db";
import { tryEmbedText, todoEmbeddingText } from "../../ai/embeddings";
import { getModelForUser } from "../../ai/model";
import {
  mergeToolInput,
  parseJsonObject,
  readBoolean,
  readString,
} from "../input";
import {
  ToolInputError,
  type Tool,
  type ToolDefinition,
  type ToolRunContext,
} from "../types";
import { runPrompt } from "../prompt/prompt";
import { findTodoMatches, type TodoCandidate } from "./search";

const todoFieldsFormat = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
  },
  required: ["name", "description"],
};

export async function extractTodoFields(
  userId: number,
  context: ToolRunContext,
): Promise<{ name: string; description: string }> {
  const input = mergeToolInput(context);
  const suppliedName = readString(input, "name");
  const suppliedDescription = readString(input, "description");

  if (
    suppliedName !== undefined &&
    suppliedName.trim() &&
    suppliedDescription !== undefined &&
    suppliedDescription.trim()
  ) {
    return { name: suppliedName, description: suppliedDescription };
  }

  const model =
    readString(input, "model") ??
    context.model ??
    (await getModelForUser(userId));

  if (!model.trim()) {
    throw new ToolInputError("todo extraction requires a model");
  }

  const prompt = [
    "Extract a todo name and description from the user input below.",
    "Return only JSON that matches the supplied schema.",
    `User input:\n${context.state}`,
    suppliedName?.trim()
      ? `Name already provided by the user: ${suppliedName}`
      : "No name was provided.",
    suppliedDescription?.trim()
      ? `Description already provided by the user: ${suppliedDescription}`
      : "No description was provided.",
  ].join("\n\n");

  const result = await runPrompt({
    model,
    prompt,
    format: todoFieldsFormat,
  });

  const parsed = parseJsonObject(result.text);
  if (!parsed) {
    throw new ToolInputError("could not determine todo name/description");
  }

  const parsedName = readString(parsed, "name");
  const parsedDescription = readString(parsed, "description");

  const name = suppliedName?.trim() || parsedName?.trim();
  const description = suppliedDescription?.trim() || parsedDescription?.trim();

  if (!name || !description) {
    throw new ToolInputError("could not determine todo name/description");
  }

  return { name, description };
}

export async function resolveTodoId(
  context: ToolRunContext,
): Promise<TodoCandidate> {
  const { todo } = await findTodoMatches(context);
  return todo;
}

export async function saveTodoWithEmbedding(todo: {
  id: number;
  name: string;
  description: string;
}): Promise<void> {
  const embedding = await tryEmbedText(todoEmbeddingText(todo));
  if (!embedding) return;

  await db
    .update(todos)
    .set({ descriptionEmbedding: embedding })
    .where(eq(todos.id, todo.id));
}

const createTodoDefinition: ToolDefinition = {
  key: "create_todo",
  name: "Create todo",
  description:
    "Create a todo. Name and description are taken from toolConfig, JSON state, or inferred from the state with the prompt helper.",
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
      model: {
        type: "string",
        description:
          "Optional generation model used to infer missing name/description fields. Defaults to the user's default generation model.",
      },
    },
  },
  outputDescription: "The created todo.",
  exampleConfig: {
    name: "Pick up Johnny from daycare",
    description: "Pick him up this afternoon.",
  },
};

export const createTodoTool: Tool = {
  definition: createTodoDefinition,

  async execute(context) {
    const { name, description } = await extractTodoFields(
      context.userId,
      context,
    );

    const [todo] = await db
      .insert(todos)
      .values({
        name,
        description,
        done: false,
        authorId: context.userId,
        actorId: context.userId,
      })
      .returning();

    if (!todo) {
      throw new Error("failed to create todo");
    }

    await saveTodoWithEmbedding(todo);

    const returnTodo = {
      id: todo.id,
      name: todo.name,
      description: todo.description,
      done: todo.done,
      authorId: todo.authorId,
      actorId: todo.actorId,
    };

    return {
      output: { todo: returnTodo },
      summary: `Created todo "${name}"`,
    };
  },
};

const updateTodoDefinition: ToolDefinition = {
  key: "update_todo",
  name: "Update todo",
  description:
    "Update a todo's name and/or description. The todo can be selected by id, by find_todo output, or inferred from state.",
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
      model: {
        type: "string",
        description:
          "Optional generation model used to infer missing name/description fields. Defaults to the user's default generation model.",
      },
      decisionModel: {
        type: "string",
        description:
          "Optional decision model used to select the todo. Defaults to the user's default decision model.",
      },
    },
  },
  outputDescription: "The updated todo.",
  exampleConfig: {
    id: 3,
    name: "Updated name",
    description: "Updated description",
  },
};

export const updateTodoTool: Tool = {
  definition: updateTodoDefinition,

  async execute(context) {
    const todo = await resolveTodoId(context);
    const input = mergeToolInput(context);
    let name = readString(input, "name");
    let description = readString(input, "description");

    if (
      (name === undefined || !name.trim()) &&
      (description === undefined || !description.trim())
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
      })
      .where(eq(todos.id, todo.id))
      .returning();

    if (!updated) {
      throw new ToolInputError(`todo ${todo.id} not found`);
    }

    await saveTodoWithEmbedding(updated);

    const returnTodo = {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      done: updated.done,
      authorId: updated.authorId,
      actorId: updated.actorId,
    };

    return {
      output: { todo: returnTodo },
      summary: `Updated todo "${updated.name}"`,
    };
  },
};

const markTodoDoneDefinition: ToolDefinition = {
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
  exampleConfig: { id: 3, done: true },
};

export const markTodoDoneTool: Tool = {
  definition: markTodoDoneDefinition,

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
    const returnTodo = {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      done: updated.done,
      authorId: updated.authorId,
      actorId: updated.actorId,
    };

    return {
      output: { todo: returnTodo },
      summary: done
        ? `Marked todo "${updated.name}" as done`
        : `Marked todo "${updated.name}" as not done`,
    };
  },
};

const deleteTodoDefinition: ToolDefinition = {
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
    },
  },
  outputDescription: "The id and name of the deleted todo.",
  exampleConfig: { id: 3 },
};

export const deleteTodoTool: Tool = {
  definition: deleteTodoDefinition,

  async execute(context) {
    const todo = await resolveTodoId(context);

    await db.delete(todos).where(eq(todos.id, todo.id));

    return {
      output: { id: todo.id, name: todo.name },
      summary: `Deleted todo "${todo.name}"`,
    };
  },
};
