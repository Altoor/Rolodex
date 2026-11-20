import { inArray } from "drizzle-orm";
import { GraphQLError } from "graphql";
import {
  db,
  decisions,
  taskResults,
  tasks,
  userDecisionOptions,
} from "@repo/db";
import {
  assertValidTaskConfig,
  defaultCanRunInParallel,
  type TaskOutputType,
} from "../task/task/task-service";
import { createQueuedTask } from "../task/queuedtask/queued-task-service";
import type { FlowTaskDraft } from "./flow-draft-service";

export interface FlowStartResult {
  taskId: number;
  taskName: string;
  created: boolean;
  queuedTask: Awaited<ReturnType<typeof createQueuedTask>> | null;
  warnings?: string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asInt(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed != null && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

async function assertTargetsExist(ids: number[]): Promise<void> {
  if (ids.length === 0) return;

  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(inArray(tasks.id, [...new Set(ids)]));
  const found = new Set(rows.map((row) => row.id));
  const missing = ids.filter((id) => !found.has(id));

  if (missing.length > 0) {
    throw new GraphQLError(`Target task not found: ${missing.join(", ")}`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
}

function parseDraft(value: unknown): FlowTaskDraft {
  const record = asRecord(value);
  if (!record) {
    throw new GraphQLError("The task draft is missing", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const kind = asString(record.kind);
  const name = asString(record.name);
  const type = asString(record.type);

  if (!kind || !name || !type) {
    throw new GraphQLError("The task draft is incomplete", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  return record as unknown as FlowTaskDraft;
}

export async function confirmFlowStartDraft(
  userId: number,
  value: unknown,
  state: string,
  fileIds: number[] | null | undefined,
  folderIds: number[] | null | undefined,
  start: boolean,
): Promise<FlowStartResult> {
  const draft = parseDraft(value);
  const warnings: string[] = [];

  if (draft.type === "tool") {
    const toolKey = asString(draft.toolKey);
    if (!toolKey) {
      throw new GraphQLError("Choose a tool before creating the task", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    const toolConfig = asRecord(draft.toolConfig) ?? {};
    const outputType: TaskOutputType =
      draft.toolOutputType === "foreach" ? "foreach" : "normal";
    const fallbackTaskId = asInt(draft.fallbackTaskId);

    await assertValidTaskConfig({
      type: "tool",
      toolKey,
      toolConfig,
      toolOutputType: outputType,
      model: null,
      decisionModel: null,
    });

    if (fallbackTaskId != null) {
      await assertTargetsExist([fallbackTaskId]);
    }

    const [task] = await db
      .insert(tasks)
      .values({
        name: draft.name,
        type: "tool",
        toolKey,
        toolConfig,
        toolOutputType: outputType,
        fallbackTaskId,
        canRunInParallel: defaultCanRunInParallel("tool", toolKey),
      })
      .returning();

    if (!task) {
      throw new GraphQLError("Could not create the task", {
        extensions: { code: "INTERNAL_SERVER_ERROR" },
      });
    }

    const queuedTask = start
      ? await createQueuedTask(userId, {
          taskId: task.id,
          state,
          fileIds,
          folderIds,
        })
      : null;

    return {
      taskId: task.id,
      taskName: task.name,
      created: true,
      queuedTask,
    };
  }

  if (draft.type === "decision") {
    const decision = asRecord(draft.decision);
    if (!decision) {
      throw new GraphQLError("The decision draft is missing", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    const decisionType = asString(decision.type) ?? "choice";
    if (!["choice", "noul", "score"].includes(decisionType)) {
      throw new GraphQLError("Unknown decision type", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    const options = Array.isArray(decision.options)
      ? decision.options.flatMap((entry) => {
          const option = asRecord(entry);
          const optionName = asString(option?.name);
          return optionName
            ? [
                {
                  name: optionName,
                  description: asString(option?.description) ?? "",
                },
              ]
            : [];
        })
      : [];

    if (decisionType !== "noul" && options.length < 2) {
      throw new GraphQLError("A decision needs at least two options", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    const resultDrafts = Array.isArray(decision.results)
      ? decision.results.flatMap((entry) => {
          const result = asRecord(entry);
          if (!result) return [];
          const probabilityThreshold = asNumber(result.probabilityThreshold);
          return [
            {
              option: asString(result.option),
              targetTaskId: asInt(result.targetTaskId),
              scoreThreshold: asNumber(result.scoreThreshold),
              probabilityThreshold:
                decisionType === "choice"
                  ? (probabilityThreshold ?? 0.8)
                  : probabilityThreshold,
              confidenceThreshold: asNumber(result.confidenceThreshold),
            },
          ];
        })
      : [];

    if (resultDrafts.length === 0) {
      throw new GraphQLError("A decision needs at least one result", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    const targetIds = resultDrafts
      .map((result) => result.targetTaskId)
      .filter((id): id is number => id != null);

    await assertTargetsExist(targetIds);

    if (start && targetIds.length === 0) {
      throw new GraphQLError(
        "Wire at least one result target before starting this decision",
        { extensions: { code: "BAD_USER_INPUT" } },
      );
    }
    if (targetIds.length === 0) {
      warnings.push(
        "This decision has no wired result target. It can be created, but not started.",
      );
    }

    const task = await db.transaction(async (tx) => {
      const [createdDecision] = await tx
        .insert(decisions)
        .values({
          name: asString(decision.name) ?? draft.name,
          type: decisionType as "choice" | "noul" | "score",
          decisionPremise:
            asString(decision.decisionPremise) ?? "Which option fits best?",
          instruction:
            asString(decision.instruction) ??
            "Choose the option that best fits the current state.",
          options:
            decisionType === "noul"
              ? null
              : options.map((option) => option.name),
          optionDescriptions:
            decisionType === "choice"
              ? options.map((option) => option.description)
              : null,
          authorId: userId,
        })
        .returning();

      if (!createdDecision) {
        throw new GraphQLError("Could not create the decision", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }

      const [createdTask] = await tx
        .insert(tasks)
        .values({
          name: draft.name,
          type: "decision",
          decisionId: createdDecision.id,
          forceUserDecideIfNoMatch: true,
          canRunInParallel: defaultCanRunInParallel("decision", null),
        })
        .returning();

      if (!createdTask) {
        throw new GraphQLError("Could not create the task", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }

      await tx.insert(taskResults).values(
        resultDrafts.map((result) => ({
          taskId: createdTask.id,
          type: decisionType as "choice" | "noul" | "score",
          option: result.option,
          scoreThreshold: result.scoreThreshold,
          probabilityThreshold: result.probabilityThreshold,
          confidenceThreshold: result.confidenceThreshold,
          resultTaskId: result.targetTaskId,
          appendState: false,
        })),
      );

      return createdTask;
    });

    const queuedTask = start
      ? await createQueuedTask(userId, {
          taskId: task.id,
          state,
          fileIds,
          folderIds,
        })
      : null;

    return {
      taskId: task.id,
      taskName: task.name,
      created: true,
      queuedTask,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  if (draft.type === "userDecision") {
    const userDecision = asRecord(draft.userDecision);
    if (!userDecision) {
      throw new GraphQLError("The user-decision draft is missing", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    const rawChoiceType = asString(userDecision.choiceType) ?? "list";
    const choiceType =
      rawChoiceType === "yesNo" || rawChoiceType === "dropdown"
        ? rawChoiceType
        : "list";

    const options = Array.isArray(userDecision.options)
      ? userDecision.options.flatMap((entry) => {
          const option = asRecord(entry);
          const label = asString(option?.label);
          if (!option || !label) return [];
          return [
            {
              label,
              description: asString(option.description),
              value:
                asString(option.value) ??
                label.toLowerCase().replace(/\s+/g, "-"),
              resultTaskId: asInt(option.resultTaskId),
            },
          ];
        })
      : [];

    if (options.length === 0) {
      throw new GraphQLError("A user decision needs at least one option", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    await assertTargetsExist(
      options
        .map((option) => option.resultTaskId)
        .filter((id): id is number => id != null),
    );

    const task = await db.transaction(async (tx) => {
      const [createdTask] = await tx
        .insert(tasks)
        .values({
          name: draft.name,
          type: "userDecision",
          userDecisionType: choiceType,
          canRunInParallel: defaultCanRunInParallel("userDecision", null),
          userDecisionConfig: {
            prompt:
              asString(userDecision.prompt) ?? "Choose an option for this task",
            acceptLabel: asString(userDecision.acceptLabel) ?? "Accept",
            yesLabel: "Yes",
            noLabel: "No",
          },
        })
        .returning();

      if (!createdTask) {
        throw new GraphQLError("Could not create the task", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }

      await tx.insert(userDecisionOptions).values(
        options.map((option, index) => ({
          taskId: createdTask.id,
          kind: "static" as const,
          label: option.label,
          description: option.description,
          value: option.value,
          resultTaskId: option.resultTaskId,
          appendState: false,
          sortOrder: index,
        })),
      );

      return createdTask;
    });

    const queuedTask = start
      ? await createQueuedTask(userId, {
          taskId: task.id,
          state,
          fileIds,
          folderIds,
        })
      : null;

    return {
      taskId: task.id,
      taskName: task.name,
      created: true,
      queuedTask,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  }

  throw new GraphQLError("Unknown task draft type", {
    extensions: { code: "BAD_USER_INPUT" },
  });
}
