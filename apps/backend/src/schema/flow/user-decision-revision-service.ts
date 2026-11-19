import { and, eq, inArray } from "drizzle-orm";
import { GraphQLError } from "graphql";
import {
  db,
  queuedTasks,
  tasks,
  userDecisionOptions,
} from "@repo/db";
import { getModelForUser } from "@repo/ai";
import { buildUserDecisionPendingChoice } from "../../queue/processors/user-decision-step";
import { publish } from "../../queue/step-store";
import type { QueuedRow } from "../../queue/types";
import { listToolDefinitions } from "../../tools/registry";
import { generateJsonObject } from "./structured-generation";

export interface UserDecisionOptionDraft {
  label: string;
  description: string | null;
  value: string;
  resultTaskId: number | null;
  resultTaskName: string | null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

export async function suggestUserDecisionOptions(
  userId: number,
  taskId: number,
  state: string | null,
  prompt: string,
): Promise<UserDecisionOptionDraft[]> {
  const task = await db.query.tasks.findFirst({ where: { id: taskId } });
  if (!task) {
    throw new GraphQLError("Task not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (task.type !== "userDecision") {
    throw new GraphQLError("Task is not a user decision task", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const existing = await db.query.userDecisionOptions.findMany({
    where: { taskId },
  });

  const model = await getModelForUser(userId);
  const config = asRecord(task.userDecisionConfig) ?? {};

  const taskRows = await db
    .select({ id: tasks.id, name: tasks.name, type: tasks.type })
    .from(tasks);
  const toolCatalog = listToolDefinitions().map((tool) => ({
    key: tool.key,
    name: tool.name,
    description: tool.description,
  }));

  const generated = await generateJsonObject({
    model,
    system:
      "You design options for a user decision step in an automation flow. " +
      "Return only JSON matching the schema. Avoid duplicating existing options. " +
      "Generate the fewest new options needed (usually 1-3). Never pad with duplicate, " +
      "generic, catch-all, or 'other' options. Each option must be directly selectable " +
      "by a person and should lead to an existing target task, use an available tool, or " +
      "be a genuinely new choice the user can wire later. Set resultTaskId only to an " +
      "existing task id, or null. Never use a tool key as a result task id.",
    prompt: [
      `Task name: ${task.name}`,
      `Question shown to the user: ${asString(config.prompt) ?? "Choose an option"}`,
      `Existing options: ${JSON.stringify(
        existing.map((option) => ({
          label: option.label,
          value: option.value,
          description: option.description,
        })),
      )}`,
      `Existing target tasks (use these ids or null for resultTaskId): ${JSON.stringify(
        taskRows,
      )}`,
      `Available tools (reference their capabilities in descriptions; never use a key as a result task id): ${JSON.stringify(
        toolCatalog,
      )}`,
      state ? `Current run state:\n${state}` : "",
      `What the user wants added or changed:\n${prompt}`,
      "Return 1-3 new static options unless the request explicitly needs more. Use a short machine value with hyphens.",
    ]
      .filter(Boolean)
      .join("\n\n"),
    format: {
      type: "object",
      properties: {
        options: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              description: { type: "string" },
              value: { type: "string" },
              resultTaskId: { type: ["integer", "null"] },
            },
            required: ["label", "value"],
          },
        },
      },
      required: ["options"],
    },
  });

  const rawOptions = Array.isArray(generated.options)
    ? generated.options
    : Array.isArray(generated)
      ? generated
      : [];

  const targetIds = rawOptions
    .map((entry) => asInt(asRecord(entry)?.resultTaskId))
    .filter((id): id is number => id != null);

  const targets =
    targetIds.length > 0
      ? await db
          .select({ id: tasks.id, name: tasks.name })
          .from(tasks)
          .where(inArray(tasks.id, targetIds))
      : [];
  const targetNames = new Map(targets.map((target) => [target.id, target.name]));

  return rawOptions.flatMap((entry) => {
    const record = asRecord(entry);
    const label = asString(record?.label);
    if (!record || !label) return [];

    const value = asString(record.value) ?? label.toLowerCase().replace(/\s+/g, "-");
    const resultTaskId = asInt(record.resultTaskId);

    return [
      {
        label,
        description: asString(record.description),
        value,
        resultTaskId: resultTaskId != null && targetNames.has(resultTaskId)
          ? resultTaskId
          : null,
        resultTaskName:
          resultTaskId != null ? (targetNames.get(resultTaskId) ?? null) : null,
      },
    ];
  });
}

interface ParsedOption {
  label: string;
  description: string | null;
  value: string;
  resultTaskId: number | null;
}

function parseDrafts(value: unknown): ParsedOption[] {
  const record = asRecord(value);
  const raw = Array.isArray(value)
    ? value
    : Array.isArray(record?.options)
      ? record.options
      : null;

  if (!raw || raw.length === 0) {
    throw new GraphQLError("Provide at least one option to create", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  return raw.map((entry, index) => {
    const option = asRecord(entry);
    const label = asString(option?.label);
    if (!option || !label) {
      throw new GraphQLError(`Option ${index + 1} needs a label`, {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    return {
      label,
      description: asString(option.description),
      value:
        asString(option.value) ?? label.toLowerCase().replace(/\s+/g, "-"),
      resultTaskId: asInt(option.resultTaskId),
    };
  });
}

export async function createUserDecisionOptions(
  userId: number,
  taskId: number,
  value: unknown,
) {
  const task = await db.query.tasks.findFirst({ where: { id: taskId } });
  if (!task) {
    throw new GraphQLError("Task not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (task.type !== "userDecision") {
    throw new GraphQLError("Task is not a user decision task", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const drafts = parseDrafts(value);

  const targetIds = [
    ...new Set(
      drafts
        .map((draft) => draft.resultTaskId)
        .filter((id): id is number => id != null),
    ),
  ];

  if (targetIds.length > 0) {
    const targets = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(inArray(tasks.id, targetIds));
    const found = new Set(targets.map((target) => target.id));
    const missing = targetIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      throw new GraphQLError(
        `Result task not found: ${missing.join(", ")}`,
        { extensions: { code: "BAD_USER_INPUT" } },
      );
    }
  }

  void userId;

  const existing = await db.query.userDecisionOptions.findMany({
    where: { taskId },
  });
  const nextSortOrder =
    existing.reduce((max, option) => Math.max(max, option.sortOrder), -1) + 1;

  return db.transaction(async (tx) =>
    Promise.all(
      drafts.map((draft, index) =>
        tx
          .insert(userDecisionOptions)
          .values({
            taskId,
            kind: "static",
            label: draft.label,
            description: draft.description,
            value: draft.value,
            resultTaskId: draft.resultTaskId,
            appendState: false,
            sortOrder: nextSortOrder + index,
          })
          .returning()
          .then((rows) => rows[0]!),
      ),
    ),
  );
}

export async function refreshUserDecisionOptions(
  userId: number,
  queuedTaskId: number,
): Promise<QueuedRow> {
  const queued = await db.query.queuedTasks.findFirst({
    where: { id: queuedTaskId },
  });

  if (!queued || queued.queued_by !== userId) {
    throw new GraphQLError("QueuedTask not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (queued.status !== "awaiting_input") {
    throw new GraphQLError("This step is not waiting for a choice", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const task = await db.query.tasks.findFirst({
    where: { id: queued.taskId },
  });

  if (!task || task.type !== "userDecision") {
    throw new GraphQLError("This step is not a user decision task", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const pendingChoice = await buildUserDecisionPendingChoice(
    task,
    queued.toolState,
  );

  if (!pendingChoice) {
    throw new GraphQLError(
      "The task has no options. Add at least one option first.",
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  const [updated] = await db
    .update(queuedTasks)
    .set({ pendingChoice })
    .where(
      and(
        eq(queuedTasks.id, queuedTaskId),
        eq(queuedTasks.status, "awaiting_input"),
      ),
    )
    .returning();

  if (!updated) {
    throw new GraphQLError("This choice is no longer waiting", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  publish(updated, "user decision options refreshed");
  return updated;
}
