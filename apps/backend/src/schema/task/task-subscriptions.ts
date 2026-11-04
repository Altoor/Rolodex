import { builder } from "../builder";
import { GraphQLError } from "graphql/error";
import { QueuedTaskEvent } from "./";
import { queueEvents, type QueuedTaskEvent as QueuedTaskEventPayload } from "../../queue";

builder.subscriptionType({
  fields: (t) => ({
    queuedTaskEvent: t.field({
      type: QueuedTaskEvent,
      subscribe: async function* (_query, _args, ctx) {
        const user = (ctx as any).user;

        if (!user) {
          throw new GraphQLError("Not logged in", {
            extensions: {
              code: "BAD_USER_INPUT",
            },
          });
        }

        for (;;) {
          const event = await new Promise<QueuedTaskEventPayload>((resolve) =>
            queueEvents.once("queuedTask", resolve),
          );
          yield event;
        }
      },
      resolve: (event) => event,
    }),
  }),
});
