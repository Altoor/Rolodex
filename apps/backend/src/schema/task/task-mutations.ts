import { and, eq, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { builder, db } from "../builder";
import { GraphQLError } from "graphql/error";
import { TaskType, Task, TaskResult, QueuedTask } from ".";
import { taskResults, tasks, queuedTasks } from "../../db";
import { DecisionType } from "../ai";
import { triggerQueue } from "../../queue";
import { requireUserId } from "../auth";
import { getUserSettings } from "../user/user-settings-service";

builder.mutationType({
  fields: (t) => ({
    createTask: t.drizzleField({
      type: Task,
      args: {
        name: t.arg.string({ required: true }),
        decisionId: t.arg.int(),
        fallbackTaskId: t.arg.int(),
        type: t.arg({ type: TaskType, required: true }),
      },
      resolve: async (
        _query,
        _root,
        { name, decisionId, fallbackTaskId, type },
        ctx,
      ) => {
        const author_id = requireUserId(ctx);

        switch (type) {
          case "decision":
            break;
          case "textPrompt":
            break;

          case "tool":
            break;
          default:
            break;
        }

        const task = {
          name,
          type,
          decisionId,
          fallbackTaskId,
        };
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
      },
      resolve: async (
        _query,
        _root,
        { id, name, type, decisionId, fallbackTaskId },
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

        switch (type) {
          case "decision":
            break;
          case "textPrompt":
            break;

          case "tool":
            break;
          default:
            break;
        }

        const taskDto = {
          name: name ?? task.name,
          type: type ?? task.type,
          decisionId: decisionId ?? task.decisionId,
          // An explicit null clears the fallback task.
          fallbackTaskId:
            fallbackTaskId !== undefined ? fallbackTaskId : task.fallbackTaskId,
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
        // Clear any tasks that used this task as their fallback.
        await db
          .update(tasks)
          .set({ fallbackTaskId: null })
          .where(eq(tasks.fallbackTaskId, id));
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
