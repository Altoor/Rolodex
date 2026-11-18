import { builder } from "../builder";

export const FileEntryKind = builder.enumType("FileEntryKind", {
  values: ["file", "folder"],
});

export const FileType = builder.enumType("FileType", {
  values: ["image", "text", "plaintext", "audio", "video", "other"],
});

export const FileEntry = builder.drizzleObject("fileEntries", {
  name: "FileEntry",
  fields: (t) => ({
    id: t.exposeInt("id"),
    parentId: t.exposeInt("parentId", { nullable: true }),
    kind: t.field({
      type: FileEntryKind,
      resolve: (parent) => parent.kind,
    }),
    name: t.exposeString("name"),
    description: t.exposeString("description"),
    path: t.field({
      type: "String",
      resolve: (parent) => parent.relativePath,
    }),
    fileType: t.field({
      type: FileType,
      nullable: true,
      resolve: (parent) => parent.fileType,
    }),
    mimeType: t.exposeString("mimeType", { nullable: true }),
    size: t.exposeInt("size", { nullable: true }),
    contentHash: t.exposeString("contentHash", { nullable: true }),
    lastEditedAt: t.field({
      type: "DateTime",
      resolve: (parent) => parent.lastEditedAt,
    }),
    filesystemModifiedAt: t.field({
      type: "DateTime",
      nullable: true,
      resolve: (parent) => parent.filesystemModifiedAt,
    }),
    createdAt: t.field({
      type: "DateTime",
      resolve: (parent) => parent.createdAt,
    }),
    updatedAt: t.field({
      type: "DateTime",
      resolve: (parent) => parent.updatedAt,
    }),
    deletedAt: t.field({
      type: "DateTime",
      nullable: true,
      resolve: (parent) => parent.deletedAt,
    }),
  }),
});

export interface FileViewTokenPayload {
  url: string;
  expiresAt: Date;
}

export const FileViewToken = builder
  .objectRef<FileViewTokenPayload>("FileViewToken")
  .implement({
    fields: (t) => ({
      url: t.exposeString("url"),
      expiresAt: t.field({
        type: "DateTime",
        resolve: (parent) => parent.expiresAt,
      }),
    }),
  });
