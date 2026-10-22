import { builder } from "../builder";
import { GraphQLError } from "graphql/error";
import { Progress } from "./ai";
import { ollama } from "../../ai/Ollama";

builder.subscriptionType({
  fields: (t) => ({
    installModel: t.field({
      type: Progress,
      args: {
        name: t.arg.string({ required: true }),
      },
      subscribe: async (_query, { name }, ctx) => {
        if (!(ctx as any).user) {
          throw new GraphQLError(
            "Not logged in. try logging in and try again",
            {
              extensions: { code: "BAD_USER_INPUT" },
            },
          );
        }

        const response = await ollama.pull({ model: name, stream: true });

        return response;
      },
      resolve: (progress) => progress,
    }),
  }),
});
