import { inArray } from "drizzle-orm";
import {
  EMBEDDING_MODEL,
  getDecisionModelForUser,
  getModelForUser,
  getVisionModelForUser,
  warmModelInBackground,
  type WarmupKind,
} from "@repo/ai";
import { db, getAppSettings, tasks } from "@repo/db";
import { getToolDefinition, type ToolModelRole } from "@repo/tools";
import type { QueuedRow, TaskRow } from "./types";

/** A model that should be loaded, and how Ollama loads that model family. */
interface ModelWarmup {
  model: string;
  kind: WarmupKind;
}

/**
 * Preloads the models a queued row will call. Called when rows are enqueued and
 * while the queue waits, so loading overlaps earlier work. Best-effort: failures
 * are logged and never block the queue.
 *
 * Rows are grouped by task id, and models are deduplicated, so a foreach that
 * fans out many image reads produces a single warmup request.
 */
export async function warmQueuedRows(
  rows: Array<
    Pick<QueuedRow, "taskId" | "queued_by" | "model" | "decisionModel">
  >,
): Promise<void> {
  if (rows.length === 0) return;

  try {
    const settings = await getAppSettings();
    if (!settings.preloadModels) return;

    const rowByTask = new Map<number, (typeof rows)[number]>();
    for (const row of rows) {
      if (row.taskId != null && !rowByTask.has(row.taskId)) {
        rowByTask.set(row.taskId, row);
      }
    }

    if (rowByTask.size === 0) return;

    const taskRows = await db
      .select()
      .from(tasks)
      .where(inArray(tasks.id, [...rowByTask.keys()]));
    const taskById = new Map(taskRows.map((task) => [task.id, task]));

    await Promise.all(
      [...rowByTask.entries()].map(async ([taskId, row]) => {
        const task = taskById.get(taskId);
        if (task) await warmTaskModels(row, task);
      }),
    );
  } catch (err) {
    console.warn(
      `[ollama] could not preload queued models: ${errorMessage(err)}`,
    );
  }
}

/** Resolves and warms every model a single task can call. */
export async function warmTaskModels(
  row: Pick<QueuedRow, "queued_by" | "model" | "decisionModel">,
  task: TaskRow,
): Promise<void> {
  const warmups: ModelWarmup[] = [];

  if (task.type === "decision") {
    warmups.push({
      model:
        row.decisionModel ??
        task.decisionModel ??
        (await getDecisionModelForUser(row.queued_by)),
      kind: "generate",
    });
  } else if (task.type === "tool" && task.toolKey) {
    const roles = getToolDefinition(task.toolKey)?.modelRoles ?? [];

    for (const role of roles) {
      const warmup = await resolveModel(role, row, task);
      if (warmup) warmups.push(warmup);
    }
  }

  const seen = new Set<string>();
  for (const warmup of warmups) {
    const key = `${warmup.kind}|${warmup.model}`;
    if (seen.has(key)) continue;
    seen.add(key);
    warmModelInBackground(warmup.model, { kind: warmup.kind });
  }
}

async function resolveModel(
  role: ToolModelRole,
  row: Pick<QueuedRow, "queued_by" | "model" | "decisionModel">,
  task: TaskRow,
): Promise<ModelWarmup | undefined> {
  switch (role) {
    case "vision":
      try {
        return {
          model: await getVisionModelForUser(row.queued_by),
          kind: "generate",
        };
      } catch {
        // No vision model configured; the tool will report that itself.
        return undefined;
      }
    case "generation":
      return {
        model:
          row.model ?? task.model ?? (await getModelForUser(row.queued_by)),
        kind: "generate",
      };
    case "decision":
      return {
        model:
          row.decisionModel ??
          task.decisionModel ??
          (await getDecisionModelForUser(row.queued_by)),
        kind: "generate",
      };
    case "embedding":
      return { model: EMBEDDING_MODEL, kind: "embed" };
    default:
      return undefined;
  }
}

/**
 * Warms configured models once at startup when `warmModelsOnStartup` is on.
 * Off by default so the app does not pin models in memory on shared hosts.
 */
export async function warmConfiguredModels(): Promise<void> {
  try {
    const settings = await getAppSettings();
    if (!settings.preloadModels || !settings.warmModelsOnStartup) return;

    const users = await db.query.userSettings.findMany();
    const warmups: ModelWarmup[] = [];

    for (const user of users) {
      if (user.defaultModelName) {
        warmups.push({ model: user.defaultModelName, kind: "generate" });
      }
      if (user.defaultDecisionModelName) {
        warmups.push({
          model: user.defaultDecisionModelName,
          kind: "generate",
        });
      }
      if (user.defaultVisionModelName) {
        warmups.push({ model: user.defaultVisionModelName, kind: "generate" });
      }
    }

    // Embeddings are shared by file/todo search and are not user-specific.
    warmups.push({ model: EMBEDDING_MODEL, kind: "embed" });

    const seen = new Set<string>();
    for (const warmup of warmups) {
      const key = `${warmup.kind}|${warmup.model}`;
      if (seen.has(key)) continue;
      seen.add(key);
      warmModelInBackground(warmup.model, { kind: warmup.kind });
    }
  } catch (err) {
    console.warn(`[ollama] startup model preload failed: ${errorMessage(err)}`);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
