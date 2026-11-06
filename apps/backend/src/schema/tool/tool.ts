import { builder } from "../builder";
import type { ToolDefinition } from "../../tools/types";

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
    exampleConfig: t.field({
      type: "JSON",
      nullable: true,
      resolve: (parent) => parent.exampleConfig ?? null,
    }),
  }),
});

export interface ToolTestResultPayload {
  output: unknown;
  summary: string;
}

export const ToolTestResult = builder
  .objectRef<ToolTestResultPayload>("ToolTestResult")
  .implement({
    fields: (t) => ({
      output: t.field({
        type: "JSON",
        nullable: true,
        resolve: (parent) => parent.output ?? null,
      }),
      summary: t.exposeString("summary"),
    }),
  });
