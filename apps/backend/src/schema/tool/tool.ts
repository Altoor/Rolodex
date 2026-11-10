import { builder } from "../builder";
import type { ToolDefinition } from "@repo/tools";

export const Tool = builder.objectRef<ToolDefinition>("Tool").implement({
  description: "A runnable tool available to tool tasks.",
  fields: (t) => ({
    key: t.exposeString("key"),
    name: t.exposeString("name"),
    description: t.exposeString("description"),
    category: t.exposeString("category"),
    inputMode: t.exposeString("inputMode"),
    inputSchema: t.field({
      type: "JSON",
      resolve: (parent) => parent.inputSchema,
    }),
    outputDescription: t.exposeString("outputDescription"),
    outputTypes: t.field({
      type: ["String"],
      resolve: (parent) => parent.outputTypes ?? ["normal"],
    }),
    foreachOutputDescription: t.exposeString("foreachOutputDescription", {
      nullable: true,
    }),
    exampleConfig: t.field({
      type: "JSON",
      nullable: true,
      resolve: (parent) => parent.exampleConfig ?? null,
    }),
  }),
});
