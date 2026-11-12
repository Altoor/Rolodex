import { builder } from "../builder";
import { requireUserId } from "../auth";
import { FileEntry, FileEntryKind } from "./file";
import {
  createFileEntryForApi,
  deleteFileEntryForApi,
  indexFileTreeForApi,
  updateFileEntryForApi,
  uploadFilesForApi,
  writeFileTextForApi,
} from "./file-service";

builder.mutationType({
  fields: (t) => ({
    createFileEntry: t.field({
      type: FileEntry,
      args: {
        kind: t.arg({ type: FileEntryKind, required: true }),
        parentId: t.arg.int({ required: false }),
        name: t.arg.string({ required: true }),
        description: t.arg.string({ required: false }),
        content: t.arg.string({ required: false }),
      },
      resolve: (_root, args, ctx) => {
        requireUserId(ctx);
        return createFileEntryForApi({
          kind: args.kind,
          parentId: args.parentId,
          name: args.name,
          description: args.description,
          content: args.content,
        });
      },
    }),

    updateFileEntry: t.field({
      type: FileEntry,
      args: {
        id: t.arg.int({ required: true }),
        name: t.arg.string({ required: false }),
        description: t.arg.string({ required: false }),
        parentId: t.arg.int({ required: false }),
      },
      resolve: (_root, args, ctx) => {
        requireUserId(ctx);
        return updateFileEntryForApi({
          id: args.id,
          name: args.name,
          description: args.description,
          parentId: args.parentId,
          parentIdProvided: "parentId" in args,
        });
      },
    }),

    deleteFileEntry: t.field({
      type: "String",
      args: {
        id: t.arg.int({ required: true }),
        recursive: t.arg.boolean({ required: false }),
      },
      resolve: (_root, { id, recursive }, ctx) => {
        requireUserId(ctx);
        return deleteFileEntryForApi(id, recursive);
      },
    }),

    writeFileText: t.field({
      type: FileEntry,
      args: {
        id: t.arg.int({ required: true }),
        content: t.arg.string({ required: true }),
      },
      resolve: (_root, { id, content }, ctx) => {
        requireUserId(ctx);
        return writeFileTextForApi(id, content);
      },
    }),

    uploadFiles: t.field({
      type: [FileEntry],
      args: {
        files: t.arg({ type: ["File"], required: true }),
        parentId: t.arg.int({ required: false }),
      },
      resolve: (_root, { files, parentId }, ctx) => {
        requireUserId(ctx);
        return uploadFilesForApi(files as File[], parentId);
      },
    }),

    indexFileTree: t.field({
      type: "JSON",
      args: {
        path: t.arg.string({ required: false }),
        apply: t.arg.boolean({ required: false }),
      },
      resolve: (_root, { path, apply }, ctx) => {
        requireUserId(ctx);
        return indexFileTreeForApi({ path, apply });
      },
    }),
  }),
});
