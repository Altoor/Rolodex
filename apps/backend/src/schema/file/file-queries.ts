import { builder } from "../builder";
import { requireUserId } from "../auth";
import { FileEntry, FileViewToken } from "./file";
import {
  createFileViewTokenForApi,
  getFileEntryForApi,
  getFileTextForApi,
  listFileEntriesForApi,
} from "./file-service";

builder.queryType({
  fields: (t) => ({
    fileEntries: t.field({
      type: [FileEntry],
      args: {
        parentId: t.arg.int({ required: false }),
        includeDeleted: t.arg.boolean({ required: false }),
      },
      resolve: (_root, args, ctx) => {
        requireUserId(ctx);
        return listFileEntriesForApi({
          parentId: args.parentId,
          includeDeleted: args.includeDeleted ?? false,
        });
      },
    }),

    getFileEntry: t.field({
      type: FileEntry,
      nullable: true,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: (_root, { id }, ctx) => {
        requireUserId(ctx);
        return getFileEntryForApi(id);
      },
    }),

    getFileText: t.field({
      type: "String",
      nullable: true,
      args: {
        id: t.arg.int({ required: true }),
        maxBytes: t.arg.int({ required: false }),
      },
      resolve: (_root, { id, maxBytes }, ctx) => {
        requireUserId(ctx);
        return getFileTextForApi(id, maxBytes);
      },
    }),

    createFileViewToken: t.field({
      type: FileViewToken,
      args: {
        id: t.arg.int({ required: true }),
      },
      resolve: (_root, { id }, ctx) => {
        const userId = requireUserId(ctx);
        return createFileViewTokenForApi(userId, id);
      },
    }),
  }),
});
