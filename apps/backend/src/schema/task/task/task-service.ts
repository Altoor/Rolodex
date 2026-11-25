import { eq } from "drizzle-orm";
import { db, taskResults, tasks, userDecisionOptions } from "@repo/db";
import {
  assertValidTaskConfig,
  defaultCanRunInParallel,
  type CreateTaskInput,
  type TaskOutputType,
  type TaskType,
  type UpdateTaskInput,
  type UserDecisionType,
} from "./task-config";
import {
  assertTasksVisible,
  loadVisibleTask,
  taskNotFound,
} from "./task-visibility";

/** Returns the provided value when defined, otherwise the stored fallback. */
function keepOrSet<T>(provided: T | undefined, fallback: T): T {
  return provided !== undefined ? provided : fallback;
}

export {
  assertValidTaskConfig,
  defaultCanRunInParallel,
  type CreateTaskInput,
  type TaskConfigInput,
  type TaskOutputType,
  type TaskType,
  type UpdateTaskInput,
  type UserDecisionOptionKind,
  type UserDecisionType,
} from "./task-config";

export async function createTask(userId: number, input: CreateTaskInput) {
  await assertTasksVisible(userId, [
    input.fallbackTaskId,
    input.onTrueTaskId,
    input.onFalseTaskId,
    input.joinTaskId,
  ]);

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
    joinTaskId: input.joinTaskId ?? null,
    model: input.model ?? null,
    decisionModel: input.decisionModel ?? null,
    decisionStateConfig: input.decisionStateConfig ?? null,
    forceUserDecideIfNoMatch: input.forceUserDecideIfNoMatch ?? true,
    userDecisionType: (input.userDecisionType ?? "list") as UserDecisionType,
    userDecisionConfig: input.userDecisionConfig ?? null,
    canRunInParallel:
      input.canRunInParallel ??
      defaultCanRunInParallel(input.type, input.toolKey),
    prioritize: input.prioritize ?? false,
  };

  await assertValidTaskConfig({
    type: task.type,
    toolKey: task.toolKey,
    toolConfig: task.toolConfig,
    toolOutputType: task.toolOutputType,
    onTrueTaskId: task.onTrueTaskId,
    onFalseTaskId: task.onFalseTaskId,
    joinTaskId: task.joinTaskId,
    model: task.model,
    decisionModel: task.decisionModel,
    decisionStateConfig: task.decisionStateConfig,
    forceUserDecideIfNoMatch: task.forceUserDecideIfNoMatch,
    userDecisionType: task.userDecisionType,
    userDecisionConfig: task.userDecisionConfig,
  });

  const [created] = await db.insert(tasks).values(task).returning();
  return created;
}

export async function updateTask(userId: number, input: UpdateTaskInput) {
  const task = await loadVisibleTask(userId, input.id);

  if (!task) {
    throw taskNotFound();
  }

  await assertTasksVisible(userId, [
    input.fallbackTaskId,
    input.onTrueTaskId,
    input.onFalseTaskId,
    input.joinTaskId,
  ]);

  const nextType = (input.type ?? task.type) as TaskType;
  const nextToolKey = keepOrSet(input.toolKey, task.toolKey);
  const nextToolConfig = keepOrSet(input.toolConfig, task.toolConfig);
  const nextToolOutputType = keepOrSet(
    input.toolOutputType,
    task.toolOutputType,
  ) as TaskOutputType;
  const nextOnTrueTaskId = keepOrSet(input.onTrueTaskId, task.onTrueTaskId);
  const nextOnFalseTaskId = keepOrSet(input.onFalseTaskId, task.onFalseTaskId);
  const nextJoinTaskId = keepOrSet(input.joinTaskId, task.joinTaskId);
  const nextModel = keepOrSet(input.model, task.model);
  const nextDecisionModel = keepOrSet(input.decisionModel, task.decisionModel);
  const nextDecisionStateConfig = keepOrSet(
    input.decisionStateConfig,
    task.decisionStateConfig,
  );
  const nextForceUserDecideIfNoMatch =
    input.forceUserDecideIfNoMatch ?? task.forceUserDecideIfNoMatch;
  const nextUserDecisionType = keepOrSet(
    input.userDecisionType,
    task.userDecisionType,
  ) as UserDecisionType;
  const nextUserDecisionConfig = keepOrSet(
    input.userDecisionConfig,
    task.userDecisionConfig,
  );
  const nextCanRunInParallel = input.canRunInParallel ?? task.canRunInParallel;
  const nextPrioritize = input.prioritize ?? task.prioritize;

  await assertValidTaskConfig({
    type: nextType,
    toolKey: nextToolKey,
    toolConfig: nextToolConfig,
    toolOutputType: nextToolOutputType,
    onTrueTaskId: nextOnTrueTaskId,
    onFalseTaskId: nextOnFalseTaskId,
    joinTaskId: nextJoinTaskId,
    model: nextModel,
    decisionModel: nextDecisionModel,
    decisionStateConfig: nextDecisionStateConfig,
    forceUserDecideIfNoMatch: nextForceUserDecideIfNoMatch,
    userDecisionType: nextUserDecisionType,
    userDecisionConfig: nextUserDecisionConfig,
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
    joinTaskId: nextJoinTaskId,
    model: nextModel,
    decisionModel: nextDecisionModel,
    decisionStateConfig: nextDecisionStateConfig,
    forceUserDecideIfNoMatch: nextForceUserDecideIfNoMatch,
    userDecisionType: nextUserDecisionType,
    userDecisionConfig: nextUserDecisionConfig,
    canRunInParallel: nextCanRunInParallel,
    prioritize: nextPrioritize,
  };

  const [updated] = await db
    .update(tasks)
    .set(taskDto)
    .where(eq(tasks.id, input.id))
    .returning();
  return updated;
}

export async function deleteTask(
  userId: number,
  id: number,
): Promise<string> {
  const task = await loadVisibleTask(userId, id);

  if (!task) {
    throw taskNotFound();
  }

  await db.delete(taskResults).where(eq(taskResults.taskId, id));
  await db
    .delete(userDecisionOptions)
    .where(eq(userDecisionOptions.taskId, id));
  // Clear any tasks/options that used this task as a target.
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
  await db
    .update(tasks)
    .set({ joinTaskId: null })
    .where(eq(tasks.joinTaskId, id));
  await db
    .update(userDecisionOptions)
    .set({ resultTaskId: null })
    .where(eq(userDecisionOptions.resultTaskId, id));

  // Switch cases and the default target live inside toolConfig JSON, so they
  // cannot be cleared with a simple UPDATE ... WHERE.
  const switchTasks = await db
    .select({ id: tasks.id, toolConfig: tasks.toolConfig })
    .from(tasks)
    .where(eq(tasks.toolKey, "switch"));

  for (const switchTask of switchTasks) {
    const config = switchTask.toolConfig;
    if (
      config === null ||
      typeof config !== "object" ||
      Array.isArray(config)
    ) {
      continue;
    }

    const record = config as Record<string, unknown>;
    let changed = false;

    const cases = Array.isArray(record.cases)
      ? record.cases.map((entry) => {
          if (
            entry !== null &&
            typeof entry === "object" &&
            !Array.isArray(entry) &&
            (entry as Record<string, unknown>).nextTaskId === id
          ) {
            changed = true;
            return { ...(entry as Record<string, unknown>), nextTaskId: null };
          }
          return entry;
        })
      : record.cases;

    const defaultTaskId =
      record.defaultTaskId === id ? null : record.defaultTaskId;
    if (record.defaultTaskId === id) changed = true;

    if (changed) {
      await db
        .update(tasks)
        .set({ toolConfig: { ...record, cases, defaultTaskId } })
        .where(eq(tasks.id, switchTask.id));
    }
  }

  await db.delete(tasks).where(eq(tasks.id, id));

  return "successfully deleted task";
}
