import { builder } from "../builder";

export interface ToolTestResultPayload {
  output: unknown;
  summary: string;
  state: string;
  toolState: unknown[];
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
      state: t.exposeString("state"),
      toolState: t.field({
        type: "JSON",
        resolve: (parent) => parent.toolState ?? [],
      }),
    }),
  });
