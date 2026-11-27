import { builder } from "../builder";
import { GraphQLError } from "graphql/error";
import { isPathAccessibleToViewer } from "@repo/tools/tools/file/services/access";
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

          // Private folders and their descendants are not announced to other
          // users, because the event path itself would leak their existence.
          if (
            !(await isPathAccessibleToViewer(user.id, event.path, {
              includeDeleted: event.type === "deleted",
            }))
          ) {
            continue;
          }

          yield event;
        }
      },
      resolve: (event) => event,
    }),
  }),
});
