import { GraphQLError } from "graphql";
import { builder } from "../builder";
import { requireUserId } from "../auth";
import { getToolDefinition, listToolDefinitions } from "../../tools/registry";
import { Tool } from "./tool";

builder.queryType({
  fields: (t) => ({
    tools: t.field({
      type: [Tool],
      resolve: (_root, _args, ctx) => {
        requireUserId(ctx);
        return listToolDefinitions();
      },
    }),

    getTool: t.field({
      type: Tool,
      nullable: true,
      args: {
        key: t.arg.string({ required: true }),
      },
      resolve: (_root, { key }, ctx) => {
        requireUserId(ctx);

        const tool = getToolDefinition(key);
        if (!tool) {
          throw new GraphQLError("Tool not found", {
            extensions: { code: "BAD_USER_INPUT" },
          });
        }

        return tool;
      },
    }),
  }),
});
