import { GraphQLError } from "graphql";
import { builder, db } from "../builder";
import { Model } from "./llmModel";
import { ollama } from "../../ai/Ollama";
import { models } from "../../db";
import { OllamaModelResponse } from "./model";
import { eq } from "drizzle-orm";

builder.queryType({
  fields: (t) => ({
    models: t.drizzleField({
      type: [Model],
      resolve: async (_root, _args, _parent, ctx) => {
        if (!(ctx as any).user) {
          throw new GraphQLError(
            "Not logged in. try logging in and try again",
            {
              extensions: { code: "BAD_USER_INPUT" },
            },
          );
        }

        const response = (await ollama.list()).models as OllamaModelResponse[];

        let modelsToReturn = await db.query.models.findMany();
        for (const ollamaModel of response) {
          let model = modelsToReturn.find(
            (dbModel) => dbModel.name === ollamaModel.name,
          );
          if (model) {
            const modelDto = {
              name: ollamaModel.name,
              modified_at: ollamaModel.modified_at as unknown as string,
              model: ollamaModel.model,
              size: ollamaModel.size ? BigInt(ollamaModel.size) : null,
              digest: ollamaModel.digest,
              details: ollamaModel.details,
              expires_at: ollamaModel.expires_at as unknown as string,
              size_vram: ollamaModel.size_vram
                ? BigInt(ollamaModel.size_vram)
                : null,
              capabilities: ollamaModel.capabilities,
              pulled: true,
              description: model.description,
            };

            if (
              new Date(model.modified_at ?? "") !==
              new Date(modelDto.modified_at)
            ) {
              await db
                .update(models)
                .set(modelDto)
                .where(eq(models.name, model.name))
                .returning();
            }
          } else {
            const newModel = {
              ...ollamaModel,
              modified_at: ollamaModel.modified_at as unknown as string,
              expires_at: ollamaModel.expires_at as unknown as string,
              size: BigInt(ollamaModel.size),
              size_vram: ollamaModel.size_vram
                ? BigInt(ollamaModel.size_vram)
                : null,
              pulled: true,
              description: null,
              capabilities: ollamaModel.capabilities,
            };

            await db.insert(models).values(newModel);

            modelsToReturn.push(newModel);
          }
        }

        return modelsToReturn;
      },
    }),
  }),
});
