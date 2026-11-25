import { GraphQLError } from "graphql";
import { eq } from "drizzle-orm";
import { db, taskResults } from "@repo/db";
import { assertTaskVisible } from "../task/task-visibility";

export type TaskResultType = "choice" | "noul" | "score";

export interface CreateTaskResultInput {
  taskId: number;
  type: string;
  option?: string | null;
  scoreThreshold?: number | null;
  probabilityThreshold?: number | null;
  confidenceThreshold?: number | null;
  resultTaskId?: number | null;
}

export interface UpdateTaskResultInput {
  id: number;
  taskId?: number | null;
  type?: string | null;
  option?: string | null;
  scoreThreshold?: number | null;
  probabilityThreshold?: number | null;
  confidenceThreshold?: number | null;
  resultTaskId?: number | null;
}

function keepOrSet<T>(provided: T | undefined, fallback: T): T {
  return provided !== undefined ? provided : fallback;
}

export async function createTaskResult(
  userId: number,
  input: CreateTaskResultInput,
) {
  await assertTaskVisible(userId, input.taskId);
  if (input.resultTaskId != null) {
    await assertTaskVisible(userId, input.resultTaskId);
  }

  const taskResult = {
    taskId: input.taskId,
    type: input.type as TaskResultType,
    option: input.option ?? null,
    scoreThreshold: input.scoreThreshold ?? null,
    probabilityThreshold: input.probabilityThreshold ?? null,
    confidenceThreshold: input.confidenceThreshold ?? null,
    resultTaskId: input.resultTaskId ?? null,
  };

  const [created] = await db.insert(taskResults).values(taskResult).returning();
  return created;
}

export async function updateTaskResult(
  userId: number,
  input: UpdateTaskResultInput,
) {
  const taskResult = await db.query.taskResults.findFirst({
    where: { id: input.id },
  });

  if (!taskResult) {
    throw new GraphQLError("TaskResult not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  await assertTaskVisible(userId, taskResult.taskId);
  if (input.taskId != null) {
    await assertTaskVisible(userId, input.taskId);
  }
  if (input.resultTaskId != null) {
    await assertTaskVisible(userId, input.resultTaskId);
  }

  // An explicitly provided value (even null) overrides the stored one,
  // while an omitted argument keeps the stored value.
  const taskResultDto = {
    taskId: input.taskId ?? taskResult.taskId,
    type: (input.type ?? taskResult.type) as TaskResultType,
    option: keepOrSet(input.option, taskResult.option),
    scoreThreshold: keepOrSet(input.scoreThreshold, taskResult.scoreThreshold),
    probabilityThreshold: keepOrSet(
      input.probabilityThreshold,
      taskResult.probabilityThreshold,
    ),
    confidenceThreshold: keepOrSet(
      input.confidenceThreshold,
      taskResult.confidenceThreshold,
    ),
    resultTaskId: keepOrSet(input.resultTaskId, taskResult.resultTaskId),
  };

  const [updated] = await db
    .update(taskResults)
    .set(taskResultDto)
    .where(eq(taskResults.id, input.id))
    .returning();
  return updated;
}

export async function deleteTaskResult(
  userId: number,
  id: number,
): Promise<string> {
  const taskResult = await db.query.taskResults.findFirst({
    where: { id },
  });

  if (!taskResult) {
    throw new GraphQLError("TaskResult not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  await assertTaskVisible(userId, taskResult.taskId);

  await db.delete(taskResults).where(eq(taskResults.id, id));

  return "successfully deleted task";
}
