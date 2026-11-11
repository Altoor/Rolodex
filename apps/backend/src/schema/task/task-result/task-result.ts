import { builder } from "../../builder";

export const TaskResult = builder.drizzleObject("taskResults", {
  name: "TaskResult",
  fields: (t) => ({
    id: t.exposeInt("id"),
    taskId: t.exposeInt("taskId"),
    type: t.exposeString("type"),
    option: t.exposeString("option"),
    scoreThreshold: t.exposeFloat("scoreThreshold"),
    probabilityThreshold: t.exposeFloat("probabilityThreshold"),
    confidenceThreshold: t.exposeFloat("confidenceThreshold"),
    resultTaskId: t.exposeInt("resultTaskId"),
    appendState: t.exposeBoolean("appendState"),
    resultTask: t.relation("resultTask"),
  }),
});
