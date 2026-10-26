import { eq } from "drizzle-orm";
import { decisions } from "../../db";
import { builder, db } from "../builder";
import { GraphQLError } from "graphql/error";
import { DecisionType, SystemOnePrompt, SystemOneResponse } from "./ai";
import { setupQuestions } from "./ai-service";
import { ollama } from "../../ai/Ollama";

builder.mutationType({
  fields: (t) => ({
    createDecision: t.drizzleField({
      type: SystemOnePrompt,
      args: {
        name: t.arg.string({ required: true }),
        type: t.arg({ type: DecisionType, required: true }),
        decisionPremise: t.arg.string({ required: true }),
        instruction: t.arg.string({ required: true }),
        options: t.arg.stringList({ required: false }),
        optionDescriptions: t.arg.stringList({ required: false }),
      },
      resolve: async (
        _query,
        _root,
        {
          name,
          type,
          decisionPremise,
          instruction,
          options,
          optionDescriptions,
        },
        ctx,
      ) => {
        const author_id = (ctx as any).user.id;

        if (!author_id) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        switch (type) {
          case "choice":
            if (!options) {
              throw new GraphQLError("missing options for choice", {
                extensions: { code: "BAD_USER_INPUT" },
              });
            }
            if (!optionDescriptions) {
              throw new GraphQLError("missing optionDescriptions for choice", {
                extensions: { code: "BAD_USER_INPUT" },
              });
            }
            break;
          case "score":
            if (!options) {
              throw new GraphQLError("missing options for score", {
                extensions: { code: "BAD_USER_INPUT" },
              });
            }

            break;
          default:
            break;
        }

        const decision = {
          name,
          type,
          decisionPremise,
          instruction,
          options,
          optionDescriptions,
          authorId: author_id,
        };
        const createdDecision = await db
          .insert(decisions)
          .values(decision)
          .returning();

        return createdDecision[0];
      },
    }),

    updateDecision: t.drizzleField({
      type: SystemOnePrompt,
      args: {
        id: t.arg.int({ required: true }),
        name: t.arg.string({ required: false }),
        type: t.arg({ type: DecisionType, required: false }),
        decisionPremise: t.arg.string({ required: false }),
        instruction: t.arg.string({ required: false }),
        options: t.arg.stringList({ required: false }),
        optionDescriptions: t.arg.stringList({ required: false }),
      },
      resolve: async (
        _query,
        _root,
        {
          id,
          name,
          type,
          decisionPremise,
          instruction,
          options,
          optionDescriptions,
        },
        ctx,
      ) => {
        const decision = await db.query.decisions.findFirst({
          where: { AND: [{ authorId: (ctx as any).user.id }, { id: id }] },
        });

        switch (type) {
          case "choice":
            if (!options) {
              throw new GraphQLError("missing options for choice", {
                extensions: { code: "BAD_USER_INPUT" },
              });
            }
            if (!optionDescriptions) {
              throw new GraphQLError("missing optionDescriptions for choice", {
                extensions: { code: "BAD_USER_INPUT" },
              });
            }
            break;
          case "score":
            if (!options) {
              throw new GraphQLError("missing options for score", {
                extensions: { code: "BAD_USER_INPUT" },
              });
            }

            break;
          default:
            break;
        }

        if (!decision) {
          throw new GraphQLError("no decision found");
        }

        const decisionDto = {
          name: name ?? decision.name,
          type: type ?? decision.type,
          decisionPremise: decisionPremise ?? decision.decisionPremise,
          instruction: instruction ?? decision.instruction,
          options: options ?? decision.options,
          optionDescriptions: optionDescriptions ?? decision.optionDescriptions,
          authorId: decision.authorId,
        };

        const updatedDecision = await db
          .update(decisions)
          .set(decisionDto)
          .where(eq(decisions.id, id))
          .returning();

        return updatedDecision[0];
      },
    }),

    runDecision: t.field({
      type: SystemOneResponse,
      args: {
        id: t.arg.int({ required: true }),
        state: t.arg.string({ required: true }),
      },
      resolve: async (_query, { id, state }, ctx) => {
        const decision = await db.query.decisions.findFirst({
          where: { id: id },
        });

        if (!decision) {
          throw new GraphQLError("no decision found");
        }

        const questions = setupQuestions([
          {
            type: decision.type,
            instruction: decision.instruction,
            decisionPremise: decision.decisionPremise,
            options: decision.options ?? undefined,
            optionDescriptions: decision.optionDescriptions ?? undefined,
          },
        ]);

        const response = await ollama.systemone({
          model: "tev1:4b",
          state,
          questions,
        });
        return response;
      },
    }),

    deleteDecision: t.field({
      type: "String",
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: async (_root, { id }, ctx) => {
        const decision = await db.query.decisions.findFirst({
          where: { AND: [{ authorId: (ctx as any).user.id }, { id: id }] },
        });

        if (!decision) {
          throw new GraphQLError("no decision found");
        }

        return "successfully deleted decision";
      },
    }),
  }),
});
