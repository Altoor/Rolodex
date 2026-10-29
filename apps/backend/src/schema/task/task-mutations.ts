import { and, eq, lt } from "drizzle-orm";
import { builder, db } from "../builder";
import { GraphQLError } from "graphql/error";
import { TaskType, Task, TaskResult, QueuedTask } from ".";
import { taskResults, tasks, queuedTasks } from "../../db";
import { DecisionType } from "../ai";

builder.mutationType({
  fields: (t) => ({
    createTask: t.drizzleField({
      type: Task,
      args: {
        name: t.arg.string({ required: true }),
        decisionId: t.arg.int(),
        type: t.arg({ type: TaskType, required: true }),
      },
      resolve: async (_query, _root, { name, decisionId, type }, ctx) => {
        const author_id = (ctx as any).user.id;

        if (!author_id) {
          throw new GraphQLError("Not logged in", {
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

        const task = {
          name,
          type,
          decisionId,
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
        type: t.arg({ type: TaskType }),
      },
      resolve: async (_query, _root, { id, name, type, decisionId }, ctx) => {
        const author_id = (ctx as any).user.id;

        if (!author_id) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

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
        const author_id = (ctx as any).user.id;

        if (!author_id) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        const task = await db.query.tasks.findFirst({ where: { id: id } });

        if (!task) {
          throw new GraphQLError("Task not found", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

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
        confidenceThreshold: t.arg.float({ required: true }),
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
        const author_id = (ctx as any).user.id;

        if (!author_id) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

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
        const author_id = (ctx as any).user.id;

        if (!author_id) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

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

        const taskResultDto = {
          taskId: taskId ?? taskResult.taskId,
          type: type ?? taskResult.type,
          option: option ?? taskResult.option,
          scoreThreshold: scoreThreshold ?? taskResult.scoreThreshold,
          probabilityThreshold:
            probabilityThreshold ?? taskResult.probabilityThreshold,
          confidenceThreshold:
            confidenceThreshold ?? taskResult.confidenceThreshold,
          resultTaskId: resultTaskId ?? taskResult.resultTaskId,
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
        const author_id = (ctx as any).user.id;

        if (!author_id) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

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
        taskId: t.arg.int({ required: true }),
        state: t.arg.string({ required: true }),
        completed: t.arg.boolean({ required: true }),
        queued_by: t.arg.int({ required: true }),
      },
      resolve: async (
        _query,
        _root,
        { taskId, state, completed, queued_by },
        ctx,
      ) => {
        const author_id = (ctx as any).user.id;

        if (!author_id) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        const queuedTask = {
          taskId,
          state,
          completed,
          queued_by,
          queued_at: new Date().toDateString(),
        };

        const createdQueuedTask = await db
          .insert(queuedTasks)
          .values(queuedTask)
          .returning();

        return createdQueuedTask[0];
      },
    }),

    completeTask: t.drizzleField({
      type: QueuedTask,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_query, _root, { id }, ctx) => {
        const author_id = (ctx as any).user.id;

        if (!author_id) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

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
          completed: true,
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
        const author_id = (ctx as any).user.id;

        if (!author_id) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        date;

        await db
          .delete(queuedTasks)
          .where(
            and(
              eq(queuedTasks.completed, true),
              lt(queuedTasks.queued_at, date.toDateString()),
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
        const author_id = (ctx as any).user.id;

        if (!author_id) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

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
