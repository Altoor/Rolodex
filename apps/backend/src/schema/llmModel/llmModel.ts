import { ModelDetails as ModelDetailsModel, ProgressResponse } from "ollama";
import { builder } from "../builder";

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

export const Model = builder.drizzleObject("models", {
  description: "An ai model",
  fields: (t) => ({
    name: t.exposeString("name"),
    modified_at: t.field({
      type: "DateTime",
      resolve: (parent) =>
        parent.modified_at ? new Date(parent.modified_at) : new Date(),
      nullable: true,
    }),
    model: t.exposeString("model", { nullable: true }),
    description: t.exposeString("description", { nullable: true }),
    capabilities: t.exposeStringList("capabilities", { nullable: true }),
    size: t.field({
      type: "Long",
      resolve: (parent) => (parent.size ? BigInt(parent.size) : undefined),
    }),
    digest: t.exposeString("digest", { nullable: true }),
    details: t.field({
      type: ModelDetails,
      resolve: (parent) => (parent.details as ModelDetailsModel) ?? undefined,
      nullable: true,
    }),
    expires_at: t.field({
      type: "DateTime",
      resolve: (parent) =>
        parent.modified_at ? new Date(parent.modified_at) : undefined,
      nullable: true,
    }),
    pulled: t.exposeBoolean("pulled", { nullable: true }),
    size_vram: t.field({
      type: "Long",
      resolve: (parent) =>
        parent.size_vram ? BigInt(parent.size_vram) : undefined,
      nullable: true,
    }),
  }),
});
