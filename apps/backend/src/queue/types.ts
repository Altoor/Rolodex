import type { queuedTasks, taskResults, tasks } from "@repo/db";

export type QueuedRow = typeof queuedTasks.$inferSelect;
export type TaskRow = typeof tasks.$inferSelect;
export type TaskResultRow = typeof taskResults.$inferSelect;
