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
import { nowForPrompt, parseTodoDateTime } from "./date";

const todoFieldsFormat = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    doByDate: {
      type: "string",
      description:
        "Do-by timestamp as an ISO 8601 date-time, or an empty string when no due date/time can be inferred.",
    },
  },
  required: ["name", "description", "doByDate"],
};

const todoDateTimeFormat = {
  type: "object",
  properties: {
    doByDate: {
      type: "string",
      description:
        "Do-by timestamp as an ISO 8601 date-time, or an empty string when no due date/time can be inferred.",
    },
  },
  required: ["doByDate"],
};

function currentTimePrompt(): string {
  const now = new Date();
  const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
  return `Current local date and time is ${nowForPrompt(now)} (${weekday}).`;
}

const dateRules = [
  'Resolve relative dates and times such as "today", "tomorrow at 15:00", "next Friday", "in three days", or "this afternoon" to an absolute ISO 8601 timestamp using the current date and time.',
  "Return an ISO 8601 timestamp with a time-of-day, for example 2026-11-08T17:00:00+01:00.",
  "If a date is mentioned without a time, use 23:59 local time on that date.",
  "Map morning/afternoon/evening to 12:00/17:00/20:00 unless a more specific time is given.",
  "If the input does not imply a due date or time, return an empty string.",
  "Never invent a deadline.",
];

function inferDoByDate(
  value: string | undefined,
  source: "model" | "explicit",
): Date | null | undefined {
  if (value === undefined) return undefined;

  try {
    return parseTodoDateTime(value);
  } catch (err) {
    if (source === "explicit") throw err;
    console.warn("todo date inference failed:", err);
    return null;
  }
}

export async function extractTodoFields(
  userId: number,
  context: ToolRunContext,
): Promise<{ name: string; description: string; doByDate: Date | null }> {
  const input = mergeToolInput(context);
  const suppliedName = readString(input, "name");
  const suppliedDescription = readString(input, "description");
  const suppliedDoByDateRaw = readString(input, "doByDate");
  const suppliedDoByDate = inferDoByDate(suppliedDoByDateRaw, "explicit");

  if (
    suppliedName !== undefined &&
    suppliedName.trim() &&
    suppliedDescription !== undefined &&
    suppliedDescription.trim() &&
    suppliedDoByDateRaw !== undefined
  ) {
    return {
      name: suppliedName,
      description: suppliedDescription,
      doByDate: suppliedDoByDate ?? null,
    };
  }

  const model =
    readString(input, "model") ??
    context.model ??
    (await getModelForUser(userId));

  if (!model.trim()) {
    throw new ToolInputError("todo extraction requires a model");
  }

  const prompt = [
    currentTimePrompt(),
    "Extract a todo name, description, and do-by timestamp from the user input below.",
    'Resolve relative dates and times such as "today", "tomorrow at 15:00", "next Friday", "in three days", or "this afternoon" to an absolute ISO 8601 timestamp using the current date and time.',
    "Rules:",
    ...dateRules.map((rule) => `- ${rule}`),
    "Return only JSON that matches the supplied schema.",
    `User input:\n${context.state}`,
    suppliedName?.trim()
      ? `Name already provided by the user: ${suppliedName}`
      : "No name was provided.",
    suppliedDescription?.trim()
      ? `Description already provided by the user: ${suppliedDescription}`
      : "No description was provided.",
    suppliedDoByDateRaw !== undefined
      ? "A do-by timestamp was already provided by the user."
      : "No do-by timestamp was provided.",
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
  const parsedDoByDate = readString(parsed, "doByDate");

  const name = suppliedName?.trim() || parsedName?.trim();

  if (!name) {
    throw new ToolInputError("could not determine todo name");
  }

  const description =
    suppliedDescription?.trim() || parsedDescription?.trim() || "";

  const doByDate =
    suppliedDoByDateRaw !== undefined
      ? (suppliedDoByDate ?? null)
      : (inferDoByDate(parsedDoByDate, "model") ?? null);

  return { name, description, doByDate };
}

/**
 * Infers only the do-by timestamp for update operations. Returns undefined
 * when the request does not change the timestamp, so callers can leave the
 * existing value untouched.
 */
export async function extractTodoDateTime(
  userId: number,
  context: ToolRunContext,
): Promise<Date | null | undefined> {
  const input = mergeToolInput(context);
  const supplied = readString(input, "doByDate");
  if (supplied !== undefined) {
    return parseTodoDateTime(supplied);
  }

  const model =
    readString(input, "model") ??
    context.model ??
    (await getModelForUser(userId));

  if (!model.trim()) {
    throw new ToolInputError("todo date extraction requires a model");
  }

  const prompt = [
    currentTimePrompt(),
    "Extract the do-by timestamp implied by the user input below.",
    "Rules:",
    ...dateRules.map((rule) => `- ${rule}`),
    "- If the input does not ask to change the due date or time, return an empty string.",
    "Return only JSON that matches the supplied schema.",
    `User input:\n${context.state}`,
  ].join("\n\n");

  const result = await runPrompt({
    model,
    prompt,
    format: todoDateTimeFormat,
  });

  const parsed = parseJsonObject(result.text);
  if (!parsed) return undefined;

  const value = readString(parsed, "doByDate");
  if (value === undefined || !value.trim()) return undefined;

  return inferDoByDate(value, "model");
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

export function toToolTodo(todo: typeof todos.$inferSelect) {
  return {
    id: todo.id,
    name: todo.name,
    description: todo.description,
    done: todo.done,
    doByDate: todo.doByDate?.toISOString() ?? null,
    authorId: todo.authorId,
    actorId: todo.actorId,
  };
}

const createTodoDefinition: ToolDefinition = {
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
  exampleConfig: {
    name: "Pick up Johnny from daycare",
    description: "Pick him up this afternoon.",
  },
};

export const createTodoTool: Tool = {
  definition: createTodoDefinition,

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

const updateTodoDefinition: ToolDefinition = {
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

    return {
      output: { todo: toToolTodo(updated) },
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
