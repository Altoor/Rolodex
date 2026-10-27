import { GraphQLError } from "graphql";
import { builder, db } from "../builder";
import { DecisionType, SystemOnePrompt, SystemOneResponse } from "./ai";
import { ollama } from "../../ai/Ollama";
import { setupQuestions } from "./ai-service";

builder.queryType({
  fields: (t) => ({
    systemOnePrompt: t.field({
      type: SystemOneResponse,
      args: {
        state: t.arg.string({ required: true }),
        instruction: t.arg.string({ required: true }),
        type: t.arg({ type: DecisionType, required: true }),
        decisionPremise: t.arg.string({ required: true }),
        options: t.arg.stringList({ required: false }),
        optionDescriptions: t.arg.stringList({ required: false }),
      },
      resolve: async (
        _root,
        {
          state,
          instruction,
          type,
          decisionPremise,
          options,
          optionDescriptions,
        },
        ctx,
      ) => {
        if (!(ctx as any).user) {
          throw new GraphQLError(
            "Not logged in. try logging in and try again",
            {
              extensions: { code: "BAD_USER_INPUT" },
            },
          );
        }

        if (type === "choice" || type === "score") {
          if (!options || options.length === 0) {
            throw new GraphQLError("Please provide options", {
              extensions: { code: "BAD_USER_INPUT" },
            });
          }

          if (
            type === "choice" &&
            (!optionDescriptions ||
              options.length !== optionDescriptions.length)
          ) {
            throw new GraphQLError("provide an a description for each option", {
              extensions: { code: "BAD_USER_INPUT" },
            });
          }
        }

        const questions = setupQuestions([
          {
            type,
            instruction,
            decisionPremise,
            options: options ?? undefined,
            optionDescriptions: optionDescriptions ?? undefined,
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

    decisions: t.drizzleField({
      type: [SystemOnePrompt],
      resolve: (_query, _root, _args, ctx) => {
        const user = (ctx as any).user;

        if (!user) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        return db.query.decisions.findMany();
      },
    }),

    getDecision: t.drizzleField({
      type: SystemOnePrompt,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: (_query, _root, { id }, ctx) => {
        const user = (ctx as any).user;

        if (!user) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        const decision = db.query.decisions.findFirst({ where: { id: id } });

        if (!decision) {
          throw new GraphQLError("Decision not found", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        return decision;
      },
    }),
  }),
});
