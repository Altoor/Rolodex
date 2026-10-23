import { builder, db } from "../builder";
import { GraphQLError } from "graphql/error";
import { Model } from "./llmModel";
import { models } from "../../db";
import { eq } from "drizzle-orm";

builder.mutationType({
  fields: (t) => ({
    createModel: t.drizzleField({
      type: Model,
      args: {
        name: t.arg.string({ required: true }),
        description: t.arg.string(),
      },
      resolve: async (_query, _root, { name, description }, ctx) => {
        if (!(ctx as any).user) {
          throw new GraphQLError(
            "Not logged in. try logging in and try again",
            {
              extensions: { code: "BAD_USER_INPUT" },
            },
          );
        }

        const modelDto = {
          name: name,
          description: description,
          pulled: false,
        };

        const model = await db.insert(models).values(modelDto).returning();

        return model[0];
      },
    }),

    updateModel: t.drizzleField({
      type: Model,
      args: {
        name: t.arg.string({ required: true }),
        description: t.arg.string(),
      },
      resolve: async (_query, _root, { name, description }, ctx) => {
        if (!(ctx as any).user) {
          throw new GraphQLError(
            "Not logged in. try logging in and try again",
            {
              extensions: { code: "BAD_USER_INPUT" },
            },
          );
        }

        let model = await db.query.models.findFirst({
          where: { name: name },
        });

        if (!(ctx as any).user) {
          throw new GraphQLError("No model of that name.", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const modelDto = {
          ...model,
          name: name,
          description: description,
        };

        const modelRes = await db
          .update(models)
          .set(modelDto)
          .where(eq(models.name, name))
          .returning();

        return modelRes[0];
      },
    }),
  }),
});
