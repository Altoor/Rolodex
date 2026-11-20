import { builder } from "../../builder";
import { requireUserId } from "../../auth";
import { exportTasksFile, importTasksFile } from "./task-transfer-service";

builder.queryType({
  fields: (t) => ({
    exportTasks: t.field({
      type: "JSON",
      args: {
        taskIds: t.arg.intList({ required: false }),
      },
      resolve: async (_root, { taskIds }, ctx) => {
        requireUserId(ctx);
        return exportTasksFile(taskIds ?? undefined);
      },
    }),
  }),
});

builder.mutationType({
  fields: (t) => ({
    importTasks: t.field({
      type: "JSON",
      args: {
        data: t.arg({ type: "JSON", required: true }),
        reuseExisting: t.arg.boolean({ required: false }),
      },
      resolve: async (_root, { data, reuseExisting }, ctx) => {
        const userId = requireUserId(ctx);
        return importTasksFile(userId, data, {
          reuseExisting: reuseExisting ?? false,
        });
      },
    }),
  }),
});
