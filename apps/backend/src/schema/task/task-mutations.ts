import { and, eq, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { builder, db } from "../builder";
import { GraphQLError } from "graphql/error";
import { TaskType, ToolOutputType, Task, TaskResult, QueuedTask } from ".";
import { taskResults, tasks, queuedTasks } from "../../db";
import { DecisionType } from "../ai";
import { triggerQueue } from "../../queue";
import { requireUserId } from "../auth";
import { getUserSettings } from "../user/user-settings-service";
import { assertPulledModel } from "../../ai/model";
import { getToolDefinition } from "../../tools/registry";

async function assertValidTaskConfig(input: {
  type: string;
  toolKey: string | null;
  toolConfig?: unknown;
  toolOutputType: string;
  onTrueTaskId?: number | null;
  onFalseTaskId?: number | null;
  model: string | null;
  decisionModel: string | null;
}): Promise<void> {
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
    if (!outputTypes.includes(input.toolOutputType as "normal" | "foreach")) {
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

builder.mutationType({
  fields: (t) => ({
    createTask: t.drizzleField({
      type: Task,
      args: {
        name: t.arg.string({ required: true }),
        decisionId: t.arg.int(),
        fallbackTaskId: t.arg.int(),
        type: t.arg({ type: TaskType, required: true }),
        toolKey: t.arg.string(),
        toolConfig: t.arg({ type: "JSON" }),
        toolOutputType: t.arg({ type: ToolOutputType }),
        onTrueTaskId: t.arg.int(),
        onFalseTaskId: t.arg.int(),
        model: t.arg.string(),
        decisionModel: t.arg.string(),
      },
      resolve: async (
        _query,
        _root,
        {
          name,
          decisionId,
          fallbackTaskId,
          type,
          toolKey,
          toolConfig,
          toolOutputType,
          onTrueTaskId,
          onFalseTaskId,
          model,
          decisionModel,
        },
        ctx,
      ) => {
        const author_id = requireUserId(ctx);

        const task = {
          name,
          type,
          decisionId,
          fallbackTaskId,
          toolKey: toolKey ?? null,
          toolConfig: toolConfig ?? null,
          toolOutputType: toolOutputType ?? "normal",
          onTrueTaskId: onTrueTaskId ?? null,
          onFalseTaskId: onFalseTaskId ?? null,
          model: model ?? null,
          decisionModel: decisionModel ?? null,
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

        const createdTask = await db.insert(tasks).values(task).returning();

        return createdTask[0];
      },
    }),

    updateTask: t.drizzleField({
      type: Task,
      args: {
        id: t.arg.int({ required: true }),
        name: t.arg.string(),
        decisionId: t.arg.int(),
        fallbackTaskId: t.arg.int(),
        type: t.arg({ type: TaskType }),
        toolKey: t.arg.string(),
        toolConfig: t.arg({ type: "JSON" }),
        toolOutputType: t.arg({ type: ToolOutputType }),
        onTrueTaskId: t.arg.int(),
        onFalseTaskId: t.arg.int(),
        model: t.arg.string(),
        decisionModel: t.arg.string(),
      },
      resolve: async (
        _query,
        _root,
        {
          id,
          name,
          type,
          decisionId,
          fallbackTaskId,
          toolKey,
          toolConfig,
          toolOutputType,
          onTrueTaskId,
          onFalseTaskId,
          model,
          decisionModel,
        },
        ctx,
      ) => {
        const author_id = requireUserId(ctx);

        const task = await db.query.tasks.findFirst({ where: { id: id } });

        if (!task) {
          throw new GraphQLError("Task not found", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        const nextType = type ?? task.type;
        const nextToolKey = toolKey !== undefined ? toolKey : task.toolKey;
        const nextToolConfig =
          toolConfig !== undefined ? toolConfig : task.toolConfig;
        const nextToolOutputType = toolOutputType ?? task.toolOutputType;
        const nextOnTrueTaskId =
          onTrueTaskId !== undefined ? onTrueTaskId : task.onTrueTaskId;
        const nextOnFalseTaskId =
          onFalseTaskId !== undefined ? onFalseTaskId : task.onFalseTaskId;
        const nextModel = model !== undefined ? model : task.model;
        const nextDecisionModel =
          decisionModel !== undefined ? decisionModel : task.decisionModel;

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
          name: name ?? task.name,
          type: nextType,
          decisionId: decisionId ?? task.decisionId,
          // An explicit null clears the fallback task.
          fallbackTaskId:
            fallbackTaskId !== undefined ? fallbackTaskId : task.fallbackTaskId,
          // Explicit nulls clear the tool/model configuration.
          toolKey: nextToolKey,
          toolConfig: nextToolConfig,
          toolOutputType: nextToolOutputType,
          onTrueTaskId: nextOnTrueTaskId,
          onFalseTaskId: nextOnFalseTaskId,
          model: nextModel,
          decisionModel: nextDecisionModel,
        };

        const updatedTask = await db
          .update(tasks)
          .set(taskDto)
          .where(eq(tasks.id, id))
          .returning();

        return updatedTask[0];
      },
    }),

    deleteTask: t.field({
      type: "String",
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_root, { id }, ctx) => {
        const author_id = requireUserId(ctx);

        const task = await db.query.tasks.findFirst({ where: { id: id } });

        if (!task) {
          throw new GraphQLError("Task not found", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
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
      },
    }),

    createTaskResult: t.drizzleField({
      type: TaskResult,
      args: {
        taskId: t.arg.int({ required: true }),
        type: t.arg({ type: DecisionType, required: true }),
        option: t.arg.string(),
        scoreThreshold: t.arg.float(),
        probabilityThreshold: t.arg.float(),
        confidenceThreshold: t.arg.float(),
        resultTaskId: t.arg.int(),
      },
      resolve: async (
        _query,
        _root,
        {
          taskId,
          type,
          option,
          scoreThreshold,
          probabilityThreshold,
          confidenceThreshold,
          resultTaskId,
        },
        ctx,
      ) => {
        const author_id = requireUserId(ctx);

        const taskResult = {
          taskId,
          type,
          option,
          scoreThreshold,
          probabilityThreshold,
          confidenceThreshold,
          resultTaskId,
        };
        const createdTask = await db
          .insert(taskResults)
          .values(taskResult)
          .returning();

        return createdTask[0];
      },
    }),

    updateTaskResult: t.drizzleField({
      type: TaskResult,
      args: {
        id: t.arg.int({ required: true }),
        taskId: t.arg.int(),
        type: t.arg({ type: DecisionType }),
        option: t.arg.string(),
        scoreThreshold: t.arg.float(),
        probabilityThreshold: t.arg.float(),
        confidenceThreshold: t.arg.float(),
        resultTaskId: t.arg.int(),
      },
      resolve: async (
        _query,
        _root,
        {
          id,
          taskId,
          type,
          option,
          scoreThreshold,
          probabilityThreshold,
          confidenceThreshold,
          resultTaskId,
        },
        ctx,
      ) => {
        const author_id = requireUserId(ctx);

        const taskResult = await db.query.taskResults.findFirst({
          where: { id: id },
        });

        if (!taskResult) {
          throw new GraphQLError("TaskResult not found", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        // An explicitly provided value (even null) overrides the stored one,
        // while an omitted argument keeps the stored value.
        const keepOrSet = <T>(provided: T | undefined, fallback: T): T =>
          provided !== undefined ? provided : fallback;

        const taskResultDto = {
          taskId: taskId ?? taskResult.taskId,
          type: type ?? taskResult.type,
          option: keepOrSet(option, taskResult.option),
          scoreThreshold: keepOrSet(scoreThreshold, taskResult.scoreThreshold),
          probabilityThreshold: keepOrSet(
            probabilityThreshold,
            taskResult.probabilityThreshold,
          ),
          confidenceThreshold: keepOrSet(
            confidenceThreshold,
            taskResult.confidenceThreshold,
          ),
          resultTaskId: keepOrSet(resultTaskId, taskResult.resultTaskId),
        };

        const updatedTask = await db
          .update(taskResults)
          .set(taskResultDto)
          .where(eq(taskResults.id, id))
          .returning();

        return updatedTask[0];
      },
    }),

    deleteTaskResult: t.field({
      type: "String",
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_root, { id }, ctx) => {
        const author_id = requireUserId(ctx);

        const taskResult = await db.query.taskResults.findFirst({
          where: { id: id },
        });

        if (!taskResult) {
          throw new GraphQLError("TaskResult not found", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        await db.delete(taskResults).where(eq(taskResults.id, id));

        return "successfully deleted task";
      },
    }),

    createQueuedTask: t.drizzleField({
      type: QueuedTask,
      args: {
        taskId: t.arg.int(),
        state: t.arg.string({ required: true }),
      },
      resolve: async (_query, _root, { taskId, state }, ctx) => {
        const author_id = requireUserId(ctx);
        const settings = await getUserSettings(author_id);
        const resolvedTaskId = taskId ?? settings.defaultTaskId;

        if (resolvedTaskId == null) {
          throw new GraphQLError(
            "No starting task selected and no default task configured",
            {
              extensions: {
                code: "BAD_USER_INPUT",
              },
            },
          );
        }

        const queuedTask = {
          taskId: resolvedTaskId,
          state,
          toolState: [],
          depth: 0,
          // A new user submission starts a new chain run.
          runId: randomUUID(),
          queued_by: author_id,
        };

        const createdQueuedTask = await db
          .insert(queuedTasks)
          .values(queuedTask)
          .returning();

        // Start the queue if it is idle (the loop is a no-op otherwise).
        triggerQueue();

        return createdQueuedTask[0];
      },
    }),

    completeTask: t.drizzleField({
      type: QueuedTask,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_query, _root, { id }, ctx) => {
        const author_id = requireUserId(ctx);

        const queuedTask = await db.query.queuedTasks.findFirst({
          where: { id: id },
        });

        if (!queuedTask) {
          throw new GraphQLError("QueuedTask not found", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        const queuedTaskDto = {
          ...queuedTask,
          status: "completed" as const,
        };

        const updatedQueuedTask = await db
          .update(queuedTasks)
          .set(queuedTaskDto)
          .where(eq(queuedTasks.id, id))
          .returning();

        return updatedQueuedTask[0];
      },
    }),

    deleteCompletedQueuedTaskFromBefore: t.field({
      type: "String",
      args: {
        date: t.arg({ type: "DateTime", required: true }),
      },
      resolve: async (_root, { date }, ctx) => {
        const author_id = requireUserId(ctx);

        date;

        await db
          .delete(queuedTasks)
          .where(
            and(
              eq(queuedTasks.status, "completed"),
              lt(queuedTasks.queued_at, date),
            ),
          );

        return "successfully deleted queuedTasks";
      },
    }),

    deleteQueuedTask: t.field({
      type: "String",
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_root, { id }, ctx) => {
        const author_id = requireUserId(ctx);

        const queuedTask = await db.query.queuedTasks.findFirst({
          where: { id: id },
        });

        if (!queuedTask) {
          throw new GraphQLError("QueuedTask not found", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        await db.delete(queuedTasks).where(eq(queuedTasks.id, id));

        return "successfully deleted queuedTask";
      },
    }),
  }),
});
