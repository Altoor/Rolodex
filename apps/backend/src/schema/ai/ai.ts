import {
  SystemOneResponse as SystemOneResponseModel,
  SystemOneUsage,
} from "ollama";
import { builder } from "../builder";

export const Usage = builder.objectRef<SystemOneUsage>("Usage").implement({
  description: "how many tokes were used?",
  fields: (t) => ({
    input_tokens: t.exposeInt("input_tokens"),
    output_tokens: t.exposeInt("output_tokens"),
  }),
});

export const SystemOneResponse = builder
  .objectRef<SystemOneResponseModel>("SystemOneResponse")
  .implement({
    description: "A systemOne response",
    fields: (t) => ({
      model: t.exposeString("model"),
      answer: t.field({
        type: "JSON",
        resolve: (parent) => parent.answers,
      }),
      usage: t.field({
        type: Usage,
        resolve: (parent) => parent.usage,
      }),
    }),
  });

export const SystemOnePrompt = builder.drizzleObject("decisions", {
  name: "SystemOnePrompt",
  fields: (t) => ({
    id: t.exposeInt("id"),
    name: t.exposeString("name"),
    type: t.exposeString("type"),
    decisionPremise: t.exposeString("decisionPremise"),
    instruction: t.exposeString("instruction"),
    options: t.exposeStringList("options"),
    optionDescriptions: t.exposeStringList("optionDescriptions"),
  }),
});

export const DecisionType = builder.enumType("DecisionType", {
  values: ["choice", "noul", "score"],
});
