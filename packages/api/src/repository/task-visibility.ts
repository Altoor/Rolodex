import { and, eq, or } from "drizzle-orm";
import { db, tasks } from "@repo/db";

/** The referenced task does not exist or is a draft owned by another user. */
export class TaskNotVisibleError extends Error {
  constructor() {
    super("Task not found");
    this.name = "TaskNotVisibleError";
  }
}

/**
 * Asserts that the caller may attach an API endpoint to this task. Assisted
 * drafts are private; treating a foreign draft as "not found" avoids leaking
 * its existence.
 */
export async function assertTaskVisibleToUser(
  userId: number,
  taskId: number,
): Promise<void> {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(
      and(
        eq(tasks.id, taskId),
        or(eq(tasks.isDraft, false), eq(tasks.draftOwnerId, userId)),
      ),
    )
    .limit(1);

  if (!row) throw new TaskNotVisibleError();
}
