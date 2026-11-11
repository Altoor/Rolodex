import { GraphQLError } from "graphql";
import { eq } from "drizzle-orm";
import { db, taskResults, tasks } from "@repo/db";
import { assertPulledModel } from "@repo/ai";
import { getToolDefinition } from "@repo/tools";

export type TaskOutputType = "normal" | "foreach";
export type TaskType = "decision" | "textPrompt" | "tool";

export interface TaskConfigInput {
  type: string;
  toolKey: string | null;
  toolConfig?: unknown;
  toolOutputType: string;
  onTrueTaskId?: number | null;
  onFalseTaskId?: number | null;
  model: string | null;
  decisionModel: string | null;
}

export interface CreateTaskInput {
  name: string;
  type: string;
  decisionId?: number | null;
  fallbackTaskId?: number | null;
  toolKey?: string | null;
  toolConfig?: unknown;
  toolOutputType?: string | null;
  onTrueTaskId?: number | null;
  onFalseTaskId?: number | null;
  model?: string | null;
  decisionModel?: string | null;
}

export interface UpdateTaskInput {
  id: number;
  name?: string | null;
  type?: string | null;
  decisionId?: number | null;
  fallbackTaskId?: number | null;
  toolKey?: string | null;
  toolConfig?: unknown;
  toolOutputType?: string | null;
  onTrueTaskId?: number | null;
  onFalseTaskId?: number | null;
  model?: string | null;
  decisionModel?: string | null;
}

function keepOrSet<T>(provided: T | undefined, fallback: T): T {
  return provided !== undefined ? provided : fallback;
}

export async function assertValidTaskConfig(
  input: TaskConfigInput,
): Promise<void> {
  if (input.type === "tool") {
    if (!input.toolKey) {
      throw new GraphQLError("toolKey is required for tool tasks", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    const definition = getToolDefinition(input.toolKey);
    if (!definition) {
      throw new GraphQLError(`Unknown tool "${input.toolKey}"`, {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    const outputTypes = definition.outputTypes ?? ["normal"];
    if (!outputTypes.includes(input.toolOutputType as TaskOutputType)) {
      throw new GraphQLError(
        `Tool "${input.toolKey}" does not support output type "${input.toolOutputType}"`,
        { extensions: { code: "BAD_USER_INPUT" } },
      );
    }

    if (input.toolKey === "if") {
      for (const [label, id] of [
        ["onTrueTaskId", input.onTrueTaskId],
        ["onFalseTaskId", input.onFalseTaskId],
      ] as const) {
        if (id == null) continue;

        const target = await db.query.tasks.findFirst({ where: { id } });
        if (!target) {
          throw new GraphQLError(`${label} ${id} does not reference a task`, {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }
      }
    }
  }

  if (
    input.toolConfig !== undefined &&
    input.toolConfig !== null &&
    (typeof input.toolConfig !== "object" || Array.isArray(input.toolConfig))
  ) {
    throw new GraphQLError("toolConfig must be a JSON object", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  for (const model of [input.model, input.decisionModel]) {
    if (!model) continue;

    try {
      await assertPulledModel(model);
    } catch (err) {
      throw new GraphQLError(err instanceof Error ? err.message : String(err), {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
  }
}

export async function createTask(input: CreateTaskInput) {
  const task = {
    name: input.name,
    type: input.type as TaskType,
    decisionId: input.decisionId ?? null,
    fallbackTaskId: input.fallbackTaskId ?? null,
    toolKey: input.toolKey ?? null,
    toolConfig: input.toolConfig ?? null,
    toolOutputType: (input.toolOutputType ?? "normal") as TaskOutputType,
    onTrueTaskId: input.onTrueTaskId ?? null,
    onFalseTaskId: input.onFalseTaskId ?? null,
    model: input.model ?? null,
    decisionModel: input.decisionModel ?? null,
  };

  await assertValidTaskConfig({
    type: task.type,
    toolKey: task.toolKey,
    toolConfig: task.toolConfig,
    toolOutputType: task.toolOutputType,
    onTrueTaskId: task.onTrueTaskId,
    onFalseTaskId: task.onFalseTaskId,
    model: task.model,
    decisionModel: task.decisionModel,
  });

  const [created] = await db.insert(tasks).values(task).returning();
  return created;
}

export async function updateTask(input: UpdateTaskInput) {
  const task = await db.query.tasks.findFirst({ where: { id: input.id } });

  if (!task) {
    throw new GraphQLError("Task not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const nextType = (input.type ?? task.type) as TaskType;
  const nextToolKey = keepOrSet(input.toolKey, task.toolKey);
  const nextToolConfig = keepOrSet(input.toolConfig, task.toolConfig);
  const nextToolOutputType = keepOrSet(
    input.toolOutputType,
    task.toolOutputType,
  ) as TaskOutputType;
  const nextOnTrueTaskId = keepOrSet(input.onTrueTaskId, task.onTrueTaskId);
  const nextOnFalseTaskId = keepOrSet(input.onFalseTaskId, task.onFalseTaskId);
  const nextModel = keepOrSet(input.model, task.model);
  const nextDecisionModel = keepOrSet(input.decisionModel, task.decisionModel);

  await assertValidTaskConfig({
    type: nextType,
    toolKey: nextToolKey,
    toolConfig: nextToolConfig,
    toolOutputType: nextToolOutputType,
    onTrueTaskId: nextOnTrueTaskId,
    onFalseTaskId: nextOnFalseTaskId,
    model: nextModel,
    decisionModel: nextDecisionModel,
  });

  const taskDto = {
    name: input.name ?? task.name,
    type: nextType,
    decisionId: input.decisionId ?? task.decisionId,
    // An explicit null clears the fallback task.
    fallbackTaskId: keepOrSet(input.fallbackTaskId, task.fallbackTaskId),
    // Explicit nulls clear the tool/model configuration.
    toolKey: nextToolKey,
    toolConfig: nextToolConfig,
    toolOutputType: nextToolOutputType,
    onTrueTaskId: nextOnTrueTaskId,
    onFalseTaskId: nextOnFalseTaskId,
    model: nextModel,
    decisionModel: nextDecisionModel,
  };

  const [updated] = await db
    .update(tasks)
    .set(taskDto)
    .where(eq(tasks.id, input.id))
    .returning();
  return updated;
}

export async function deleteTask(id: number): Promise<string> {
  const task = await db.query.tasks.findFirst({ where: { id } });

  if (!task) {
    throw new GraphQLError("Task not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  await db.delete(taskResults).where(eq(taskResults.taskId, id));
  // Clear any tasks that used this task as their fallback or branch.
  await db
    .update(tasks)
    .set({ fallbackTaskId: null })
    .where(eq(tasks.fallbackTaskId, id));
  await db
    .update(tasks)
    .set({ onTrueTaskId: null })
    .where(eq(tasks.onTrueTaskId, id));
  await db
    .update(tasks)
    .set({ onFalseTaskId: null })
    .where(eq(tasks.onFalseTaskId, id));
  await db.delete(tasks).where(eq(tasks.id, id));

  return "successfully deleted task";
}
