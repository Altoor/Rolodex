import { builder } from "../builder";
import { GraphQLError } from "graphql/error";
import {
  fileEvents,
  type FileEntryEventPayload,
} from "./file-events";

export const FileEntryEvent = builder
  .objectRef<FileEntryEventPayload>("FileEntryEvent")
  .implement({
    fields: (t) => ({
      type: t.exposeString("type"),
      id: t.exposeInt("id", { nullable: true }),
      parentId: t.exposeInt("parentId", { nullable: true }),
      path: t.exposeString("path", { nullable: true }),
      at: t.exposeString("at"),
    }),
  });

builder.subscriptionType({
  fields: (t) => ({
    fileEntryEvent: t.field({
      type: FileEntryEvent,
      subscribe: async function* (_query, _args, ctx) {
        const user = (ctx as any).user;

        if (!user) {
          throw new GraphQLError("Not logged in", {
            extensions: { code: "UNAUTHENTICATED" },
          });
        }

        for (;;) {
          const event = await new Promise<FileEntryEventPayload>((resolve) =>
            fileEvents.once("fileEntry", resolve),
          );

          yield event;
        }
      },
      resolve: (event) => event,
    }),
  }),
});
