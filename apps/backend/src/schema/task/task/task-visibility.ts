import { GraphQLError } from "graphql";
import { and, eq, inArray, or, type SQL } from "drizzle-orm";
import { db, tasks } from "@repo/db";

export type TaskRow = typeof tasks.$inferSelect;
type TaskVisibility = Pick<TaskRow, "isDraft" | "draftOwnerId">;

/**
 * A task is visible to a user when it is a normal (non-draft) task, or when it
 * is an assisted draft owned by that user. Every read, run, wiring, transfer,
 * and endpoint path must apply this rule; drafts are otherwise a cross-user
 * data leak.
 */
export function visibleTaskCondition(userId: number): SQL {
  return or(eq(tasks.isDraft, false), eq(tasks.draftOwnerId, userId))!;
}

export function isTaskVisible(task: TaskVisibility, userId: number): boolean {
  return !task.isDraft || task.draftOwnerId === userId;
}

export function taskNotFound(): GraphQLError {
  return new GraphQLError("Task not found", {
    extensions: { code: "BAD_USER_INPUT" },
  });
}

export async function loadVisibleTask(
  userId: number,
  taskId: number,
): Promise<TaskRow | undefined> {
  const [row] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), visibleTaskCondition(userId)))
    .limit(1);

  return row;
}

export async function assertTaskVisible(
  userId: number,
  taskId: number,
): Promise<TaskRow> {
  const row = await loadVisibleTask(userId, taskId);
  if (!row) throw taskNotFound();
  return row;
}

/** Throws unless every referenced task id is visible to the user. */
export async function assertTasksVisible(
  userId: number,
  ids: Array<number | null | undefined>,
): Promise<void> {
  const unique = [
    ...new Set(ids.filter((id): id is number => typeof id === "number")),
  ];
  if (unique.length === 0) return;

  const visible = await visibleTaskIds(userId, unique);
  if (unique.some((id) => !visible.has(id))) throw taskNotFound();
}

/** The subset of `ids` the user is allowed to see. */
export async function visibleTaskIds(
  userId: number,
  ids: number[],
): Promise<Set<number>> {
  if (ids.length === 0) return new Set();

  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(inArray(tasks.id, ids), visibleTaskCondition(userId)));

  return new Set(rows.map((row) => row.id));
}
