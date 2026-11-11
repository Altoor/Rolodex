import { builder } from "../../builder";
import { GraphQLError } from "graphql/error";
import { QueuedTaskEvent } from "./queued-task";
import {
  queueEvents,
  type QueuedTaskEvent as QueuedTaskEventPayload,
} from "../../../queue";

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

          // Only stream steps that belong to the subscribed user's runs.
          if (event.queuedTask.queued_by !== user.id) continue;

          yield event;
        }
      },
      resolve: (event) => event,
    }),
  }),
});
