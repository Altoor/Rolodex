import { GraphQLError } from "graphql";
import { db } from "@repo/db";
import type { RunRow } from "./assisted-types";

/** Throws the same not-found error for missing and foreign runs. */
export async function requireOwnedRun(userId: number, runId: string) {
  const run = await db.query.runs.findFirst({ where: { id: runId } });
  if (!run || run.userId !== userId) {
    throw new GraphQLError("Run not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return run;
}

export async function loadRunRow(runId: string): Promise<RunRow> {
  const run = await db.query.runs.findFirst({ where: { id: runId } });
  if (!run) {
    throw new GraphQLError("Run not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return run;
}
