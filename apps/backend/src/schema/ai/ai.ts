import {
  ModelDetails as ModelDetailsModel,
  ModelResponse,
  ProgressResponse,
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

export const Progress = builder
  .objectRef<ProgressResponse>("Progress")
  .implement({
    description: "How far along is the progress?",
    fields: (t) => ({
      status: t.exposeString("status"),
      digest: t.exposeString("digest"),
      total: t.field({
        type: "Long",
        resolve: (parent) => (parent.total ? BigInt(parent.total) : undefined),
      }),
      completed: t.field({
        type: "Long",
        resolve: (parent) =>
          parent.completed ? BigInt(parent.completed) : undefined,
      }),
    }),
  });

export const ModelDetails = builder
  .objectRef<ModelDetailsModel>("ModelDetails")
  .implement({
    description: "Details of the model",
    fields: (t) => ({
      parent_model: t.exposeString("parent_model"),
      format: t.exposeString("format"),
      family: t.exposeString("family"),
      families: t.exposeStringList("families"),
      parameter_size: t.exposeString("parameter_size"),
      quantization_level: t.exposeString("quantization_level"),
    }),
  });

export const Model = builder.objectRef<ModelResponse>("Model").implement({
  description: "An ai model",
  fields: (t) => ({
    name: t.exposeString("name"),
    modified_at: t.field({
      type: "DateTime",
      resolve: (parent) => parent.modified_at,
    }),
    model: t.exposeString("model"),
    size: t.field({
      type: "Long",
      resolve: (parent) => (parent.size ? BigInt(parent.size) : undefined),
    }),
    digest: t.exposeString("digest"),
    details: t.field({
      type: ModelDetails,
      resolve: (parent) => parent.details,
    }),
    expires_at: t.field({
      type: "DateTime",
      resolve: (parent) => parent.expires_at,
    }),
    size_vram: t.exposeInt("size_vram"),
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
    decisionType: t.exposeString("decisionType"),
    instruction: t.exposeString("instruction"),
    options: t.exposeStringList("options"),
    optionDescriptions: t.exposeStringList("optionDescriptions"),
  }),
});
