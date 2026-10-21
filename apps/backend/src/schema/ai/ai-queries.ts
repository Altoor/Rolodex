import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { SystemOneResponse } from "./ai";
import { ollama } from "../../ai/Ollama";
import { setupQuestions } from "./ai-service";

builder.queryType({
  fields: (t) => ({
    systemOneChoicePrompt: t.field({
      type: SystemOneResponse,
      args: {
        state: t.arg.string({ required: true }),
        instruction: t.arg.string({ required: true }),
        decisionType: t.arg.string({ required: true }),
        options: t.arg.stringList({ required: true }),
        optionDescriptions: t.arg.stringList({ required: true }),
      },
      resolve: async (
        _root,
        { state, instruction, decisionType, options, optionDescriptions },
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

        if (options.length !== optionDescriptions.length) {
          throw new GraphQLError("provide an a description for each option", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        const questions = setupQuestions([
          {
            type: "choice",
            instruction,
            decisionType,
            options,
            optionDescriptions,
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

    systemOneNoulPrompt: t.field({
      type: SystemOneResponse,
      args: {
        state: t.arg.string({ required: true }),
        instruction: t.arg.string({ required: true }),
        decisionType: t.arg.string({ required: true }),
      },
      resolve: async (_root, { state, instruction, decisionType }, ctx) => {
        if (!(ctx as any).user) {
          throw new GraphQLError(
            "Not logged in. try logging in and try again",
            {
              extensions: { code: "BAD_USER_INPUT" },
            },
          );
        }

        const questions = setupQuestions([
          { type: "noul", instruction, decisionType },
        ]);

        const response = await ollama.systemone({
          model: "tev1:4b",
          state,
          questions,
        });
        return response;
      },
    }),

    systemOneScorePrompt: t.field({
      type: SystemOneResponse,
      args: {
        state: t.arg.string({ required: true }),
        instruction: t.arg.string({ required: true }),
        decisionType: t.arg.string({ required: true }),
        options: t.arg.stringList({ required: true }),
      },
      resolve: async (
        _root,
        { state, instruction, decisionType, options },
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

        const questions = setupQuestions([
          { type: "score", instruction, decisionType, options },
        ]);

        const response = await ollama.systemone({
          model: "tev1:4b",
          state,
          questions,
        });
        return response;
      },
    }),
  }),
});
