import { GraphQLError } from "graphql";
import { ToolInputError } from "@repo/tools";
import { FilesystemError } from "@repo/tools/tools/file/services/paths";

/** Error surfaced by the signed file-content endpoint. */
export class FileViewError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "FileViewError";
  }
}

export function badInput(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "BAD_USER_INPUT" },
  });
}

export function notFound(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "NOT_FOUND" },
  });
}

export function asGraphQLError(err: unknown): GraphQLError {
  if (err instanceof GraphQLError) return err;

  // Filesystem/tool validation errors use relative paths and are safe to show.
  if (err instanceof FilesystemError || err instanceof ToolInputError) {
    return badInput(err.message);
  }

  // Do not leak absolute paths, SQL, or stack details to API clients.
  console.error("File operation failed:", err);
  return new GraphQLError("File operation failed", {
    extensions: { code: "INTERNAL_SERVER_ERROR" },
  });
}
