import { builder } from "../builder";
import { requireUserId } from "../auth";
import { FileEntry, FileEntryKind } from "./file";
import {
  createFileEntryForApi,
  deleteFileEntryForApi,
  updateFileEntryForApi,
  writeFileTextForApi,
} from "./file-entry-write-service";
import { indexFileTreeForApi } from "./file-index-service";
import { uploadFilesForApi } from "./file-upload-service";

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
        private: t.arg.boolean({ required: false }),
        root: t.arg.boolean({ required: false }),
      },
      resolve: (_root, args, ctx) => {
        const userId = requireUserId(ctx);
        return createFileEntryForApi({
          kind: args.kind,
          parentId: args.parentId,
          name: args.name,
          description: args.description,
          content: args.content,
          private: args.private,
          root: args.root,
          userId,
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
        private: t.arg.boolean({ required: false }),
        root: t.arg.boolean({ required: false }),
      },
      resolve: (_root, args, ctx) => {
        const userId = requireUserId(ctx);
        return updateFileEntryForApi({
          id: args.id,
          name: args.name,
          description: args.description,
          parentId: args.parentId,
          parentIdProvided: "parentId" in args,
          private: args.private,
          privateProvided: "private" in args,
          root: args.root,
          rootProvided: "root" in args,
          userId,
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
        const userId = requireUserId(ctx);
        return deleteFileEntryForApi(id, recursive, userId);
      },
    }),

    writeFileText: t.field({
      type: FileEntry,
      args: {
        id: t.arg.int({ required: true }),
        content: t.arg.string({ required: true }),
      },
      resolve: (_root, { id, content }, ctx) => {
        const userId = requireUserId(ctx);
        return writeFileTextForApi(id, content, userId);
      },
    }),

    uploadFiles: t.field({
      type: [FileEntry],
      args: {
        files: t.arg({ type: ["File"], required: true }),
        parentId: t.arg.int({ required: false }),
      },
      resolve: (_root, { files, parentId }, ctx) => {
        const userId = requireUserId(ctx);
        return uploadFilesForApi(files as File[], parentId, userId);
      },
    }),

    indexFileTree: t.field({
      type: "JSON",
      args: {
        path: t.arg.string({ required: false }),
        apply: t.arg.boolean({ required: false }),
      },
      resolve: (_root, { path, apply }, ctx) => {
        const userId = requireUserId(ctx);
        return indexFileTreeForApi({ path, apply }, userId);
      },
    }),
  }),
});
